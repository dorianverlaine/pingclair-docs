import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { llmsHeaders, llmsIndex } from '../lib/llms';

export const prerender = true;

/**
 * 🤖 The English index: a map of the documentation for a model that wants to
 * fetch only the pages it needs. Each entry points at the page's Markdown twin
 * rather than the rendered page, which is the whole point of publishing both,
 * and the two localized indexes are named in the header.
 */
export const GET: APIRoute = async ({ site }) => {
	const docs = await getCollection('docs');
	const origin = site ?? new URL('https://pingclair.com');
	return new Response(llmsIndex(origin, docs, null), { headers: llmsHeaders });
};
