import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		// Astro's default id generator lowercases entry ids, which would turn the
		// `zh-TW` locale directory into `/zh-tw/` and make Starlight fall back to
		// the default locale for that page's `lang`. Keeping the path verbatim
		// keeps `/zh-TW/` and `/zh-CN/` as written.
		loader: docsLoader({
			generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ''),
		}),
		schema: docsSchema(),
	}),
};
