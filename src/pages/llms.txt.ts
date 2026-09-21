import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

/**
 * The case-preserved path of a page inside the content directory. Astro
 * lowercases entry ids, so `filePath` is the only case-accurate source.
 */
function slugOf(filePath: string | undefined): string {
	return filePath?.replace(/^.*?content\/docs\//, '').replace(/\.(md|mdx)$/, '') ?? '';
}

const otherLocales = ['zh-TW', 'zh-CN', 'ja', 'ko'];

/** English pages only: the root locale is the one without a prefix. */
const isRootLocale = (slug: string) => !otherLocales.includes(slug.split('/')[0] ?? '');

/**
 * The llms.txt index: a map of the documentation for a model that wants to
 * fetch only the pages it needs. Every entry points at the Markdown endpoint
 * rather than the rendered page, which is the whole point of publishing both.
 */
export const GET: APIRoute = async ({ site }) => {
	const docs = await getCollection('docs');
	const origin = site ?? new URL('https://pingclair.dev');

	const pages = docs.map((entry) => ({ entry, slug: slugOf(entry.filePath) }));

	const lines: string[] = [
		'# Pingclair',
		'',
		'> Pingclair is a reverse proxy and static file server written in Rust, serving HTTP/1.1, HTTP/2, and HTTP/3 from a Caddyfile-compatible configuration language with automatic HTTPS.',
		'',
		'> Every page below is available as Markdown by appending `.md` to its URL. The whole documentation in one file is at ' +
			new URL('/llms-full.txt', origin).toString() +
			'.',
		'',
		'> These pages are published in four other languages as well: /zh-TW/, /zh-CN/, /ja/, and /ko/.',
		'',
	];

	const english = pages
		.filter(({ entry, slug }) => isRootLocale(slug) && !entry.data.draft)
		.sort((a, b) => a.slug.localeCompare(b.slug));

	for (const { entry, slug } of english) {
		const markdown = new URL(`/${slug.replace(/\/index$/, '')}.md`, origin).toString();
		lines.push(`- [${entry.data.title}](${markdown}): ${entry.data.description ?? ''}`.trimEnd());
	}

	lines.push('');

	return new Response(lines.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
