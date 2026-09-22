import { markdownRoute, markdownStaticPaths } from '../lib/docs-endpoints';

export const prerender = true;

/**
 * 📄 Raw Markdown for every page, at the page's own path plus `.md`.
 *
 * The "Copy page" button and the `/.well-known` agent surfaces fetch from here,
 * so what lands on the clipboard is the source the page was written in rather
 * than a reflow of its rendered HTML. The same bytes are also published at
 * `.txt`, and `public/_headers` serves both as `text/plain`: the content is
 * Markdown, but the media type keeps agent fetch stacks from refusing it.
 */
export const getStaticPaths = markdownStaticPaths;

export const GET = markdownRoute('text/markdown');
