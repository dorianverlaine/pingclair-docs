/**
 * WebMCP tools for the documentation.
 *
 * Browsers that implement WebMCP expose `navigator.modelContext`; everywhere
 * else this file does nothing. Both tools call the same `/mcp` endpoint agents
 * use, so there is one implementation of the search and one of the page read.
 */

const modelContext = navigator.modelContext;

if (typeof modelContext?.registerTool === 'function') {
	const callTool = async (name, args) => {
		const response = await fetch('/mcp', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: crypto.randomUUID(),
				method: 'tools/call',
				params: { name, arguments: args },
			}),
		});
		if (!response.ok) throw new Error(`mcp ${response.status}`);
		const payload = await response.json();
		const text = (payload.result?.content ?? [])
			.map((part) => part.text ?? '')
			.join('\n')
			.trim();
		if (!text) throw new Error(payload.error?.message ?? 'no result');
		return text;
	};

	modelContext.registerTool({
		name: 'search_pingclair_docs',
		description:
			'Search the Pingclair documentation. Pingclair is a reverse proxy and static file server written in Rust. Returns matching pages with their URLs.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Words to search for, such as "reverse proxy" or "http3".' },
				limit: { type: 'integer', description: 'Maximum number of pages to return. Defaults to 5.' },
			},
			required: ['query'],
		},
		execute: ({ query, limit }) => callTool('search_docs', { query, limit }),
	});

	modelContext.registerTool({
		name: 'read_pingclair_page',
		description: 'Read one page of the Pingclair documentation as Markdown.',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'The page path, such as /start/quickstart/.' },
			},
			required: ['path'],
		},
		execute: ({ path }) => callTool('read_page', { path }),
	});
}
