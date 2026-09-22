/**
 * 🔗 The paths agents fetch directly.
 *
 * Every page is published three times: the rendered HTML at its own URL, and
 * two twins at `<path>.md` and `<path>.txt` with identical bytes. Astro
 * lowercases entry ids, so `filePath` is the only case-accurate source of a
 * page's path, and a locale home page keeps its `index` because that is where
 * the twins are published (`/fr/index.md`, not `/fr.md`).
 */

/** The locales that live under a path prefix; the root locale has none. */
export const LOCALES = ['fr', 'ja', 'ko', 'zh-CN', 'zh-TW'] as const;

export type Locale = (typeof LOCALES)[number];

/** The case-preserved path of a page inside the content directory. */
export function slugOf(filePath: string | undefined): string {
	return filePath?.replace(/^.*?content\/docs\//, '').replace(/\.(md|mdx)$/, '') ?? '';
}

/** True for pages of the root locale, which is the one without a prefix. */
export function isRootLocale(slug: string): boolean {
	return !(LOCALES as readonly string[]).includes(slug.split('/')[0] ?? '');
}

/** The locale a slug belongs to, or `null` for the root locale. */
export function localeOf(slug: string): Locale | null {
	const first = slug.split('/')[0] ?? '';
	return (LOCALES as readonly string[]).includes(first) ? (first as Locale) : null;
}

/**
 * `/start/install.md`, `/fr/index.md`. The empty slug is the site root, whose
 * twin is published as `/index.md`.
 */
export function twinPath(slug: string, extension: 'md' | 'txt'): string {
	return `/${slug || 'index'}.${extension}`;
}

/** The human-facing URL of a page. */
export function pagePath(slug: string): string {
	const withoutIndex = slug.replace(/\/index$/, '');
	return withoutIndex === 'index' || withoutIndex === '' ? '/' : `/${withoutIndex}/`;
}

/**
 * 🧹 The published Markdown of a page.
 *
 * MDX pages carry imports and JSX that only exist for rendering. The JSX tags
 * are removed and the content they wrapped is de-indented, because a line that
 * keeps its component indentation would render as a code block in Markdown.
 * Fenced code blocks are left alone: their indentation is content.
 */
export function toMarkdown(body: string): string {
	const lines: string[] = [];
	let fence: string | null = null;
	let jsxDepth = 0;

	for (const line of body.split('\n')) {
		if (/^\s*import\s.+from\s.+;$/.test(line)) continue;

		if (fence) {
			lines.push(line);
			if (line.trimStart().startsWith(fence)) fence = null;
			continue;
		}

		const opening = /^\s*(```|~~~)/.exec(line);
		if (opening) {
			fence = opening[1] ?? '```';
			lines.push(line);
			continue;
		}

		const tag = /^\s*<\/?([A-Z][A-Za-z0-9]*)(\s[^>]*)?>\s*$/.exec(line);
		if (tag) {
			const closing = line.trimStart().startsWith('</');
			const selfClosing = /\/>\s*$/.test(line.trimEnd());
			// A component's own title is content: a `<Card title="Install">` would
			// otherwise vanish with the tag and leave its body unlabelled.
			const title = /title="([^"]+)"/.exec(tag[2] ?? '')?.[1];
			if (closing) jsxDepth = Math.max(0, jsxDepth - 1);
			else if (!selfClosing) jsxDepth += 1;
			if (!closing && title) lines.push(`**${title}**`);
			continue;
		}

		// One tab per open component level: dropping exactly as many as are open
		// leaves the text at column zero, where Markdown reads it as prose rather
		// than as an indented code block.
		lines.push(jsxDepth > 0 ? line.replace(new RegExp(`^\\t{0,${jsxDepth}}`), '') : line);
	}

	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimStart() + '\n';
}
