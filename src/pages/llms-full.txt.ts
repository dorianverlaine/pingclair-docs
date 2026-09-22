import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

const otherLocales = ['fr', 'ja', 'ko', 'zh-CN', 'zh-TW'];

/** Astro lowercases entry ids, so the case-accurate path comes from `filePath`. */
function slugOf(filePath: string | undefined): string {
	return filePath?.replace(/^.*?content\/docs\//, '').replace(/\.(md|mdx)$/, '') ?? '';
}

/** English pages only: the root locale is the one without a prefix. */
const isRootLocale = (slug: string) => !otherLocales.includes(slug.split('/')[0] ?? '');

/** Strip the import and component lines an MDX page adds for rendering. */
function toMarkdown(body: string): string {
	return body
		.split('\n')
		.filter((line) => !/^\s*import\s.+from\s.+;$/.test(line))
		.join('\n')
		.replace(/^<\/?[A-Z][A-Za-z]*(\s[^>]*)?>\s*$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Every page of every locale in one file, English first. Agents that would
 * rather read one document than follow 45 links get the whole site here.
 */
export const GET: APIRoute = async ({ site }) => {
	const docs = await getCollection('docs');
	const origin = site ?? new URL('https://pingclair.dev');
	const pages = docs.map((entry) => ({ entry, slug: slugOf(entry.filePath) }));

	const chunks: string[] = [
		'# Pingclair documentation',
		'',
		'Every page of the Pingclair documentation (https://github.com/dorianverlaine/pingclair) in one file. Each section names its source URL. The same pages are also published in French, Japanese, Korean, Simplified Chinese, and Traditional Chinese under /fr/, /ja/, /ko/, /zh-CN/, and /zh-TW/.',
		'',
	];

	const english = pages
		.filter(({ entry, slug }) => isRootLocale(slug) && !entry.data.draft)
		.sort((a, b) => a.slug.localeCompare(b.slug));

	for (const { entry, slug } of english) {
		// Page URLs read better than `.md` paths for a human following along, so
		// an `index` page collapses to its section root.
		const pagePath = slug.replace(/\/index$/, '').replace(/^index$/, '');
		const url = new URL(pagePath === '' ? '/' : `/${pagePath}/`, origin).toString();

		chunks.push(
			'---',
			'',
			`# ${entry.data.title}`,
			'',
			`Source: ${url}`,
			'',
			toMarkdown(entry.body ?? ''),
			'',
		);
	}

	return new Response(chunks.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
