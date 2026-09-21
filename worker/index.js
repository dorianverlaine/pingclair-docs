/**
 * The Pingclair docs Worker.
 *
 * The site is static: Astro writes HTML, Markdown twins, and assets into
 * `dist`, and the assets server answers from them. This script adds the one
 * behavior the assets server cannot express — Markdown content negotiation for
 * agents — and hands every other request straight back to it.
 *
 * `wrangler.toml` sets `run_worker_first`, because assets-first routing would
 * answer the request before the negotiation could see it.
 */

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

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

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

		const response = await env.ASSETS.fetch(request);
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
