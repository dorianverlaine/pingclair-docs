import { getCollection, getEntry } from 'astro:content';
import { slugOf, toMarkdown } from './agent-paths';

/**
 * 📄 The shared machinery behind the `.md` and `.txt` twins.
 *
 * One route registers every page of every locale, and the two endpoints serve
 * identical bytes: `.md` keeps the conventional name, `.txt` exists for clients
 * that look for plain text. Both answer `text/plain` — `public/_headers`
 * overrides the media type for `.md`, because several agent fetch stacks reject
 * `text/markdown` outright — while the worker's `Accept: text/markdown`
 * negotiation still returns the real media type for clients that ask for it.
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

		return new Response(withTitle(entry, toMarkdown(entry.body)), {
			headers: {
				'Content-Type': `${contentType}; charset=utf-8`,
				'Cache-Control': 'public, max-age=3600',
			},
		});
	};
}

/**
 * 🏷️ The page's own title, on top of its body.
 *
 * Starlight takes the title from the frontmatter, so the published Markdown
 * starts with prose and an agent that fetched the file on its own has to guess
 * which page it is holding. The twin gets the same heading the rendered page
 * shows — emoji included — unless the body already opens with one.
 */
function withTitle(entry: { data: { title?: string; h1_emoji?: string } }, body: string): string {
	const title = entry.data.title?.trim();
	if (!title || /^#\s/.test(body)) return body;
	const emoji = entry.data.h1_emoji?.trim();
	return `# ${emoji ? `${emoji} ` : ''}${title}\n\n${body}`;
}
