import { getCollection, getEntry } from 'astro:content';
import { slugOf, toMarkdown } from './agent-paths';

/**
 * 📄 The shared machinery behind the `.md` and `.txt` twins.
 *
 * One route registers every page of every locale, and the two endpoints differ
 * only in the content type they answer with: `.md` is `text/markdown` for
 * clients that understand it, `.txt` is `text/plain` for the agent fetch stacks
 * that reject anything else. The bytes are identical.
 */

export async function markdownStaticPaths() {
	const docs = await getCollection('docs');
	return docs
		.map((entry) => ({
			slug: slugOf(entry.filePath),
			id: entry.id,
		}))
		.filter(({ slug }) => slug !== '')
		.map(({ slug, id }) => ({ params: { slug }, props: { id } }));
}

export function markdownRoute(contentType: string) {
	return async ({ props }: { props: unknown }) => {
		const entry = await getEntry('docs', (props as { id: string }).id);
		if (!entry?.body) return new Response('Not found\n', { status: 404 });

		return new Response(toMarkdown(entry.body), {
			headers: {
				'Content-Type': `${contentType}; charset=utf-8`,
				'Cache-Control': 'public, max-age=3600',
			},
		});
	};
}
