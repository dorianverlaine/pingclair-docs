import { markdownRoute, markdownStaticPaths } from '../lib/docs-endpoints';

export const prerender = true;

/**
 * 📄 The same Markdown as the `.md` twin, served as `text/plain`.
 *
 * `text/markdown` is the correct type and the `.md` endpoint keeps it, but some
 * agent fetch stacks answer `400 Unsupported content-type` for it, while
 * `text/plain` is accepted everywhere. The page head advertises both, and the
 * in-page "View as Markdown" link points here.
 */
export const getStaticPaths = markdownStaticPaths;

export const GET = markdownRoute('text/plain');
