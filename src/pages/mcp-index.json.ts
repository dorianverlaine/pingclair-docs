import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

/** The case-preserved path of a page inside the content directory. */
function slugOf(filePath: string | undefined): string {
	return filePath?.replace(/^.*?content\/docs\//, '').replace(/\.(md|mdx)$/, '') ?? '';
}

/** The URL a reader opens, and the asset that holds its Markdown twin. */
function urlsFor(slug: string): { page: string; markdown: string } {
	const directory = slug.replace(/\/index$/, '');
	return {
		page: directory === 'index' ? '/' : `/${directory}/`,
		markdown: `/${slug}.md`,
	};
}

/**
 * The search index behind `/mcp` and the WebMCP tools. Starlight's Pagefind
 * index is built for the browser and this script runs in a Worker, so the
 * Worker searches this plain JSON instead: every page's title, description,
 * and Markdown body, in one file small enough to fetch on demand.
 */
export const GET: APIRoute = async ({ site }) => {
	const docs = await getCollection('docs');

	const pages = docs
		.map((entry) => {
			const slug = slugOf(entry.filePath);
			const { page, markdown } = urlsFor(slug);
			return {
				path: page,
				markdown,
				locale: slug.includes('/') ? (slug.split('/')[0] ?? 'en') : 'en',
				title: entry.data.title ?? slug,
				description: entry.data.description ?? '',
				text: (entry.body ?? '').replace(/\s+\n/g, '\n').trim(),
			};
		})
		.filter((page) => page.path !== '/' || page.locale === 'en')
		.sort((a, b) => a.path.localeCompare(b.path));

	return new Response(
		JSON.stringify(
			{
				origin: site?.origin ?? 'https://pingclair.aqeo.dev',
				generatedFrom: 'src/content/docs',
				pages,
			},
			null,
			'\t',
		),
		{
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'public, max-age=3600',
			},
		},
	);
};
