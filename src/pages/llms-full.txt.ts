import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { llmsFull, llmsHeaders } from '../lib/llms';

export const prerender = true;

/**
 * 🤖 Every English page in one file, for an agent that would rather read one
 * document than follow forty links. Each section names its source URL, and the
 * two localized editions are named in the header.
 */
export const GET: APIRoute = async ({ site }) => {
	const docs = await getCollection('docs');
	const origin = site ?? new URL('https://pingclair.com');
	return new Response(llmsFull(origin, docs, null), { headers: llmsHeaders });
};
