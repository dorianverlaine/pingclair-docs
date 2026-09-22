import type { CollectionEntry } from 'astro:content';
import { LOCALES, isRootLocale, pagePath, slugOf, toMarkdown, twinPath, type Locale } from './agent-paths';

/**
 * 🤖 The llms.txt surfaces.
 *
 * Two shapes, each in six languages: `llms.txt` is the index a model reads to
 * decide which pages to fetch, and `llms-full.txt` is the whole documentation
 * in one file. Entries use `- [Title](url) — description`; the em dash keeps a
 * description from running into the URL after a closing parenthesis, which is
 * what happens with the more common `: description` suffix when a naive
 * extractor scans the line for something URL-shaped.
 */

export type DocEntry = CollectionEntry<'docs'>;

const localeNames: Record<Locale, string> = {
	fr: 'French',
	ja: 'Japanese',
	ko: 'Korean',
	'zh-CN': 'Simplified Chinese',
	'zh-TW': 'Traditional Chinese',
};

const intro =
	'> Pingclair is a reverse proxy and static file server written in Rust, serving HTTP/1.1, HTTP/2, and HTTP/3 from a Caddyfile-compatible configuration language with automatic HTTPS.';

/** Pages of one locale, published and sorted, without the slug noise. */
export function pagesFor(docs: DocEntry[], locale: Locale | null) {
	return docs
		.map((entry) => ({ entry, slug: slugOf(entry.filePath) }))
		.filter(({ entry, slug }) => {
			if (entry.data.draft) return false;
			return locale === null ? isRootLocale(slug) : slug.startsWith(`${locale}/`);
		})
		.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function llmsIndex(origin: URL, docs: DocEntry[], locale: Locale | null): string {
	const scope = locale === null ? 'English' : localeNames[locale];
	const lines: string[] = [
		`# Pingclair — ${scope} documentation`,
		'',
		intro,
		'',
		'> Every page below is published as Markdown at the URL shown, and the same bytes are also available as plain text by replacing `.md` with `.txt`. The whole documentation in one file is at ' +
			new URL(locale === null ? '/llms-full.txt' : `/${locale}/llms-full.txt`, origin).toString() +
			'.',
		'',
		'> All six languages are published side by side: the English index is /llms.txt, and the others are /fr/llms.txt, /ja/llms.txt, /ko/llms.txt, /zh-CN/llms.txt, and /zh-TW/llms.txt.',
		'',
	];

	for (const { entry, slug } of pagesFor(docs, locale)) {
		const markdown = new URL(twinPath(slug, 'md'), origin).toString();
		lines.push(`- [${entry.data.title}](${markdown}) — ${entry.data.description ?? ''}`.trimEnd());
	}

	lines.push('');
	return lines.join('\n');
}

export function llmsFull(origin: URL, docs: DocEntry[], locale: Locale | null): string {
	const scope = locale === null ? 'English' : localeNames[locale];
	const chunks: string[] = [
		`# Pingclair documentation — ${scope}`,
		'',
		'Every page of the Pingclair documentation (https://github.com/dorianverlaine/pingclair) in one file, ' +
			(locale === null ? 'in English' : `in ${scope}`) +
			'. Each section names its source URL.',
		'',
		'All six languages are published side by side: /llms-full.txt for English, and /fr/llms-full.txt, /ja/llms-full.txt, /ko/llms-full.txt, /zh-CN/llms-full.txt, and /zh-TW/llms-full.txt.',
		'',
	];

	for (const { entry, slug } of pagesFor(docs, locale)) {
		chunks.push(
			'---',
			'',
			`# ${entry.data.title}`,
			'',
			`Source: ${new URL(pagePath(slug), origin).toString()}`,
			'',
			toMarkdown(entry.body ?? ''),
			'',
		);
	}

	return chunks.join('\n');
}

/** Shared headers for both shapes: plain text, cached, no Markdown MIME. */
export const llmsHeaders = {
	'Content-Type': 'text/plain; charset=utf-8',
	'Cache-Control': 'public, max-age=600',
} as const;

/** The five prefixed locales, for `getStaticPaths`. */
export const localePaths = () => LOCALES.map((locale) => ({ params: { locale } }));
