import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import type { Locale } from '../../lib/agent-paths';
import { llmsFull, llmsHeaders, localePaths } from '../../lib/llms';

export const prerender = true;

/** 🤖 One file per locale, so a model can read a whole translation at once. */
export const getStaticPaths = localePaths;

export const GET: APIRoute = async ({ site, params }) => {
	const docs = await getCollection('docs');
	const origin = site ?? new URL('https://pingclair.com');
	const locale = params.locale as Locale;
	return new Response(llmsFull(origin, docs, locale), { headers: llmsHeaders });
};
