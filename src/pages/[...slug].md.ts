import { markdownRoute, markdownStaticPaths } from '../lib/docs-endpoints';

export const prerender = true;

/**
 * 📄 Raw Markdown for every page, at the page's own path plus `.md`.
 *
 * The "Copy page" button and the `/.well-known` agent surfaces fetch from here,
 * so what lands on the clipboard is the source the page was written in rather
 * than a reflow of its rendered HTML. The identical bytes are also published at
 * `.txt` as `text/plain` for fetch stacks that reject `text/markdown`.
 */
export const getStaticPaths = markdownStaticPaths;

export const GET = markdownRoute('text/markdown');
