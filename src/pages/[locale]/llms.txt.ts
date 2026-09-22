import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import type { Locale } from '../../lib/agent-paths';
import { llmsHeaders, llmsIndex, localePaths } from '../../lib/llms';

export const prerender = true;

/**
 * 🤖 The same index for each of the five prefixed locales. An agent that reads
 * the localized pages should not have to guess these URLs, so the English
 * `llms.txt` names them and each one is published here.
 */
export const getStaticPaths = localePaths;

export const GET: APIRoute = async ({ site, params }) => {
	const docs = await getCollection('docs');
	const origin = site ?? new URL('https://pingclair.dev');
	const locale = params.locale as Locale;
	return new Response(llmsIndex(origin, docs, locale), { headers: llmsHeaders });
};
