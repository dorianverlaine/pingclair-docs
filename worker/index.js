/**
 * The Pingclair docs Worker.
 *
 * The site is static: Astro writes HTML, Markdown twins, and assets into
 * `dist`, and the assets server answers from them. This script adds the two
 * behaviors the assets server cannot express — Markdown content negotiation,
 * and the documentation servers an agent can query (`/mcp` and `/a2a`) — and
 * hands every other request straight back to it.
 *
 * 🧭 It also answers on the retired hostname, where every request becomes a
 * permanent redirect to the canonical origin, so links written before the move
 * keep working.
 *
 * `wrangler.toml` sets `run_worker_first`, because assets-first routing would
 * answer the request before either behavior could see it.
 */

const MCP_PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'pingclair-docs', version: '0.1.0' };

/** The origin every canonical URL, sitemap entry, and discovery document names. */
const CANONICAL_ORIGIN = 'https://pingclair.com';

/**
 * 🔁 Hostnames the site has moved away from. They stay bound as custom domains
 * so old links land here instead of going dark, and every request on them is
 * redirected to `CANONICAL_ORIGIN`.
 */
const RETIRED_HOSTS = new Set(['pingclair.aqeo.dev']);

/**
 * 🧊 The one-line install address: `https://pingclair.com/install.sh`.
 *
 * The script itself lives in the server repository and is published to the R2
 * release bucket by every release; this Worker proxies it rather than keeping a
 * copy, so there is no second file to drift. The GitHub raw URL is the fallback
 * for the same reason the installer has one: a documentation site that cannot
 * install its own server is not much of a documentation site.
 */
const INSTALLER_SOURCES = [
	['r2', 'https://releases.pingclair.com/pingclair/install.sh'],
	['github', 'https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh'],
];
const INSTALLER_PATHS = new Set(['/install.sh', '/install']);

const TOOLS = [
	{
		name: 'search_docs',
		description:
			'Full-text search over the Pingclair documentation. Returns the matching pages with their URLs and an excerpt.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Words to search for.' },
				limit: { type: 'integer', description: 'Maximum number of pages to return. Defaults to 5.' },
			},
			required: ['query'],
		},
	},
	{
		name: 'read_page',
		description: 'Read one documentation page as Markdown.',
		inputSchema: {
			type: 'object',
			properties: { path: { type: 'string', description: 'The page path, such as /start/quickstart/.' } },
			required: ['path'],
		},
	},
	{
		name: 'list_pages',
		description: 'List every published page with its path and title.',
		inputSchema: { type: 'object', properties: {} },
	},
];

/** The search index, kept for the lifetime of the isolate. */
let cachedIndex;

function json(body, status = 200, headers = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
	});
}

function rpcError(id, code, message) {
	return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

function rpcResult(id, result) {
	return json({ jsonrpc: '2.0', id: id ?? null, result });
}

/** Reads `/mcp-index.json` once per isolate and keeps it in memory. */
async function loadIndex(env, origin) {
	if (!cachedIndex) {
		cachedIndex = (async () => {
			const response = await env.ASSETS.fetch(new URL('/mcp-index.json', origin), { method: 'GET' });
			if (!response.ok) throw new Error(`index responded ${response.status}`);
			return response.json();
		})();
		// A failed load must not be remembered as the index.
		cachedIndex.catch(() => {
			cachedIndex = undefined;
		});
	}
	return cachedIndex;
}

/** Ranks pages by where the query terms appear: title beats description beats body. */
function searchPages(pages, query, limit) {
	const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9+#._-]+/).filter((term) => term.length > 1))];
	if (!terms.length) return [];

	const scored = [];
	for (const page of pages) {
		const title = page.title.toLowerCase();
		const description = page.description.toLowerCase();
		const body = page.text.toLowerCase();
		let score = 0;
		for (const term of terms) {
			if (title.includes(term)) score += 6;
			if (description.includes(term)) score += 3;
			const hits = body.split(term).length - 1;
			score += Math.min(hits, 8);
		}
		if (score > 0) scored.push({ page, score });
	}

	return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(Number(limit) || 5, 20)));
}

/** A window of body text around the first term that appears in it. */
function excerpt(page, query) {
	const body = page.text;
	const at = query
		.toLowerCase()
		.split(/[^a-z0-9+#._-]+/)
		.filter((term) => term.length > 1)
		.map((term) => body.toLowerCase().indexOf(term))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];

	if (at === undefined) return body.replace(/\s+/g, ' ').slice(0, 220);
	const start = Math.max(0, at - 80);
	return `${start > 0 ? '…' : ''}${body.slice(start, start + 240).replace(/\s+/g, ' ').trim()}…`;
}

function formatMatches(matches, query, origin) {
	if (!matches.length) {
		return `No page in the Pingclair documentation matched "${query}". The full page list is at ${origin}/llms.txt.`;
	}
	return matches
		.map(({ page }, index) => `${index + 1}. ${page.title} — ${origin}${page.path}\n   ${page.description}\n   ${excerpt(page, query)}`)
		.join('\n\n');
}

function formatPageList(pages, origin) {
	return pages.map((page) => `${origin}${page.path}\t${page.title}`).join('\n');
}

/**
 * The documentation MCP server, stateless over Streamable HTTP: one JSON-RPC
 * message in, one JSON-RPC response out. Sessions, SSE streams, and
 * server-initiated requests are deliberately absent — every tool here reads a
 * static document and returns.
 */
async function handleMcp(request, env, url) {
	if (request.method !== 'POST') {
		return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Use POST with a JSON-RPC message.' } }, 405, { allow: 'POST' });
	}

	let payload;
	try {
		payload = await request.json();
	} catch {
		return rpcError(null, -32700, 'Parse error');
	}

	const { id, method, params } = payload ?? {};
	// A notification carries no id and expects no body back.
	if (id === undefined || id === null) return new Response(null, { status: 202 });

	switch (method) {
		case 'initialize':
			return rpcResult(id, {
				protocolVersion: params?.protocolVersion ?? MCP_PROTOCOL_VERSION,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { ...SERVER_INFO, title: 'Pingclair documentation' },
				instructions:
					'Search and read the Pingclair documentation. Pingclair is a reverse proxy and static file server written in Rust. Answers cite the page that carries them.',
			});

		case 'ping':
			return rpcResult(id, {});

		case 'tools/list':
			return rpcResult(id, { tools: TOOLS });

		case 'tools/call': {
			const name = params?.name;
			const args = params?.arguments ?? {};
			const index = await loadIndex(env, url.origin);
			const text = await callTool(name, args, index, siteOrigin(index, url), env);
			return rpcResult(id, { content: [{ type: 'text', text }], isError: false });
		}

		default:
			return rpcError(id, -32601, `Method not found: ${method}`);
	}
}

/** The published origin, so links never carry the development host. */
function siteOrigin(index, url) {
	return index?.origin ?? url.origin;
}

/**
 * The Markdown twin of a page, wherever Astro wrote it. Page URLs arrive both
 * with and without a trailing slash, and callers may pass either the page path
 * or the `.md` path itself.
 */
async function readPageMarkdown(env, origin, pathname) {
	const candidates = pathname.endsWith('.md') ? [pathname] : markdownCandidates(pathname.replace(/^\/+/, '/'));
	for (const candidate of candidates) {
		const asset = await env.ASSETS.fetch(new URL(candidate, origin), { method: 'GET' });
		if (asset.ok) return { path: candidate, markdown: await asset.text() };
	}
	return null;
}

async function callTool(name, args, index, origin, env) {
	switch (name) {
		case 'search_docs': {
			const query = String(args.query ?? '').trim();
			if (!query) return 'search_docs needs a non-empty "query".';
			return formatMatches(searchPages(index.pages, query, args.limit), query, origin);
		}

		case 'read_page': {
			const path = String(args.path ?? '').trim();
			if (!path) return 'read_page needs a "path", such as /start/quickstart/.';
			const page = await readPageMarkdown(env, origin, path.startsWith('/') ? path : `/${path}`);
			if (!page) return `No page at ${path}. Use list_pages for the published paths.`;
			return `# source: ${origin}${page.path}\n\n${page.markdown}`;
		}

		case 'list_pages':
			return formatPageList(index.pages, origin);

		default:
			return `Unknown tool: ${name}`;
	}
}

/**
 * The documentation lookup agent, A2A over JSON-RPC. It answers with the pages
 * that match the message; it does not generate prose, and the card says so.
 */
async function handleA2a(request, env, url) {
	if (request.method !== 'POST') {
		return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Use POST with a JSON-RPC message.' } }, 405, { allow: 'POST' });
	}

	let payload;
	try {
		payload = await request.json();
	} catch {
		return rpcError(null, -32700, 'Parse error');
	}

	const method = payload?.method;
	if (method !== 'message/send') return rpcError(payload?.id, -32601, `Method not found: ${method}`);

	const message = payload?.params?.message ?? {};
	const question = (message.parts ?? [])
		.filter((part) => (part.kind ?? part.type) === 'text')
		.map((part) => part.text ?? '')
		.join('\n')
		.trim();
	if (!question) {
		return rpcResult(payload?.id, {
			kind: 'task',
			id: message.messageId ?? crypto.randomUUID(),
			contextId: message.contextId ?? crypto.randomUUID(),
			status: { state: 'rejected', timestamp: new Date().toISOString() },
			artifacts: [],
		});
	}

	const index = await loadIndex(env, url.origin);
	const matches = searchPages(index.pages, question, 5);
	const origin = siteOrigin(index, url);

	return rpcResult(payload?.id, {
		kind: 'task',
		id: message.messageId ?? crypto.randomUUID(),
		contextId: message.contextId ?? crypto.randomUUID(),
		status: { state: 'completed', timestamp: new Date().toISOString() },
		artifacts: [
			{
				artifactId: crypto.randomUUID(),
				name: 'documentation-matches',
				parts: [{ kind: 'text', text: formatMatches(matches, question, origin) }],
			},
		],
		history: [message],
	});
}

/** True when the client asked for Markdown, per the "Markdown for Agents" convention. */
function wantsMarkdown(accept) {
	return /\btext\/markdown\b/i.test(accept ?? '');
}

/**
 * Paths that are never negotiated: hashed build output, the search index, and
 * anything that already names a file.
 */
function isPagePath(pathname) {
	if (pathname.startsWith('/_astro/') || pathname.startsWith('/pagefind/')) return false;
	return !/\.[a-z0-9]+$/i.test(pathname);
}

/**
 * Asset paths that may hold the Markdown twin of a page. Astro writes a page at
 * `<path>.md` (`/start/quickstart/` answers at `/start/quickstart.md`), except
 * for directory indexes, which live at `<path>/index.md` (`/zh-TW/` answers at
 * `/zh-TW/index.md`). The page URL alone does not say which one the author
 * wrote, so both are tried in turn.
 */
function markdownCandidates(pathname) {
	const withoutTrailingSlash = pathname.replace(/\/+$/, '');
	return [`${withoutTrailingSlash}.md`, `${withoutTrailingSlash}/index.md`];
}

/** Adds `vary: accept` without dropping the values the asset already carried. */
function withVaryAccept(headers) {
	const vary = headers.get('vary');
	if (!vary) headers.set('vary', 'accept');
	else if (!/\baccept\b/i.test(vary)) headers.set('vary', `${vary}, accept`);
	return headers;
}

/**
 * 🔁 The permanent redirect a retired hostname answers with, or `null` when the
 * request already arrived on the canonical one. `GET` and `HEAD` get the 301
 * browsers, crawlers, and link checkers expect; every other method gets 308,
 * because a client `POST`ing to `/mcp` must keep its method and body.
 */
function retiredRedirect(request, url) {
	if (!RETIRED_HOSTS.has(url.hostname)) return null;
	const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
	return Response.redirect(new URL(`${url.pathname}${url.search}`, CANONICAL_ORIGIN), status);
}

/**
 * 🧊 Answers `/install.sh` with the installer the release publisher published.
 *
 * The body is streamed rather than read into memory, `HEAD` is passed through
 * so a client that probes before fetching sees the same headers, and the short
 * `max-age` keeps a new release's installer from hiding behind an old cache.
 */
async function serveInstaller(request) {
	for (const [source, target] of INSTALLER_SOURCES) {
		try {
			const upstream = await fetch(target, {
				method: request.method === 'HEAD' ? 'HEAD' : 'GET',
				cf: { cacheTtl: 60 },
			});
			if (!upstream.ok) continue;
			return new Response(request.method === 'HEAD' ? null : upstream.body, {
				status: 200,
				headers: {
					'content-type': 'text/x-shellscript; charset=utf-8',
					'cache-control': 'public, max-age=300',
					'x-installer-source': source,
				},
			});
		} catch {
			// Try the next source: a documentation site that cannot install its
			// own server is not much of a documentation site.
		}
	}
	return new Response(
		'🚫 The installer could not be fetched from releases.pingclair.com or GitHub.\n' +
			'The release channel is at https://releases.pingclair.com/pingclair/channels/latest\n',
		{
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		},
	);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		const redirect = retiredRedirect(request, url);
		if (redirect) return redirect;

		if (INSTALLER_PATHS.has(url.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
			return serveInstaller(request);
		}

		if (url.pathname === '/mcp' || url.pathname === '/a2a') {
			try {
				return await (url.pathname === '/mcp' ? handleMcp(request, env, url) : handleA2a(request, env, url));
			} catch (error) {
				// An agent gets a JSON-RPC error it can read, not an HTML 500.
				return rpcError(null, -32603, `Internal error: ${error?.message ?? error}`);
			}
		}

		if (request.method === 'GET' && wantsMarkdown(request.headers.get('accept')) && isPagePath(url.pathname)) {
			for (const candidate of markdownCandidates(url.pathname)) {
				const asset = await env.ASSETS.fetch(new URL(candidate, url.origin), { method: 'GET' });
				if (!asset.ok) continue;

				const markdown = await asset.text();
				const headers = withVaryAccept(new Headers(asset.headers));
				headers.set('content-type', 'text/markdown; charset=utf-8');
				// Roughly four characters per token; the header is a hint for
				// callers that budget context, not a tokenizer.
				headers.set('x-markdown-tokens', String(Math.ceil(markdown.length / 4)));
				return new Response(markdown, { status: 200, headers });
			}
		}

		// 🧭 A page asked for without its trailing slash. The assets server
		// answers those with a 307, and some agent fetch stacks do not follow
		// redirects — or probe with HEAD before fetching — so the page is served
		// directly at the URL they asked for, for both verbs. The canonical link
		// inside the page still names the slashed URL.
		if ((request.method === 'GET' || request.method === 'HEAD') && isPagePath(url.pathname) && !url.pathname.endsWith('/')) {
			const page = await env.ASSETS.fetch(new URL(`${url.pathname}/index.html`, url.origin), { method: 'GET' });
			if (page.ok && page.headers.get('content-type')?.startsWith('text/html')) {
				return new Response(page.body, {
					status: 200,
					statusText: 'OK',
					headers: withVaryAccept(new Headers(page.headers)),
				});
			}
		}

		const response = await env.ASSETS.fetch(request);

		// An extensionless file reaches the assets server without a usable
		// content type, and RFC 9727 names one for this document.
		if (url.pathname === '/.well-known/api-catalog') {
			const headers = new Headers(response.headers);
			headers.set('content-type', 'application/linkset+json');
			return new Response(response.body, { status: response.status, headers });
		}

		if (response.headers.get('content-type')?.startsWith('text/html')) {
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers: withVaryAccept(new Headers(response.headers)),
			});
		}
		return response;
	},
};
