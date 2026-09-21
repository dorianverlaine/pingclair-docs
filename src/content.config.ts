import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		/*
		 * Load-bearing. Astro's default id generator slugifies, which lowercases
		 * the locale directory: `zh-TW/…` becomes `zh-tw/…`. Starlight matches a
		 * page's locale by comparing that directory against the locale keys in
		 * `astro.config.mjs`, so the mismatch makes Starlight believe the Chinese
		 * locales have no pages at all. It then generates a fallback route for
		 * every English page under the same URL — rendering English content with
		 * an "untranslated" notice, and shadowing the real Chinese pages.
		 */
		loader: docsLoader({
			/*
			 * The trailing `/index` is dropped as well, matching how Starlight
			 * names a locale's home page: it looks for `zh-TW`, not
			 * `zh-TW/index`, when deciding whether a translation exists. Without
			 * this the fallback lookup misses, and Astro logs a route conflict
			 * for every locale home page.
			 */
			generateId: ({ entry }) =>
				entry.replace(/\.(md|mdx)$/, '').replace(/\/index$/, ''),
		}),
		schema: docsSchema(),
	}),
};
