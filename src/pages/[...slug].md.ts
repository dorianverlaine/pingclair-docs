import type { APIRoute } from 'astro';
import { getCollection, getEntry } from 'astro:content';

export const prerender = true;

/*
 * Raw Markdown for every page, at the page's own path plus `.md`. The "Copy
 * page" button fetches from here, so what lands on the clipboard is the source
 * the page was written in rather than a reflow of its rendered HTML.
 *
 * The slug is not `entry.id`: Astro lowercases ids (`zh-tw/start/quickstart`),
 * while the routes Starlight generates keep the case of the file path. The
 * path is therefore computed from `filePath`, and the entry id travels in
 * `props` so the lookup still works.
 */
export async function getStaticPaths() {
	const docs = await getCollection('docs');
	return docs.flatMap((entry) => {
		const path = entry.filePath?.replace(/^.*?content\/docs\//, '').replace(/\.(md|mdx)$/, '');
		if (!path) return [];
		const slugs = new Set([path]);
		// `/zh-TW/index.md` and `/zh-TW.md` both resolve to the locale home page.
		if (path.endsWith('/index')) slugs.add(path.slice(0, -'/index'.length));
		return [...slugs].map((slug) => ({ params: { slug }, props: { id: entry.id } }));
	});
}

export const GET: APIRoute = async ({ props }) => {
	const entry = await getEntry('docs', (props as { id: string }).id);
	if (!entry?.body) return new Response('Not found\n', { status: 404 });

	return new Response(toMarkdown(entry.body), {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};

/**
 * Markdown entries are returned as written. MDX entries additionally carry the
 * component imports and tags that only exist for the rendered page, so those
 * are removed rather than pasted into someone's editor.
 */
function toMarkdown(body: string): string {
	return (
		body
			.split('\n')
			.filter((line) => !/^\s*import\s.+from\s.+;$/.test(line))
			.join('\n')
			.replace(/^<\/?[A-Z][A-Za-z]*(\s[^>]*)?>\s*$/gm, '')
			.replace(/\n{3,}/g, '\n\n')
			.trimStart() + '\n'
	);
}
