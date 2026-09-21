// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// `site` is used for canonical URLs and the generated sitemap. Update it when
// the production domain is chosen.
export default defineConfig({
	site: 'https://pingclair.dev',
	integrations: [
		starlight({
			title: 'Pingclair',
			description:
				'Documentation for Pingclair, a reverse proxy and static file server written in Rust.',
			// Shiki ships no Caddyfile grammar. The fences stay `caddyfile` so the
			// server repository's documentation tests recognize them, and the alias
			// gives them shell-compatible highlighting (# comments, shell-like
			// quoting) instead of falling back to plain text.
			expressiveCode: {
				shiki: {
					langAlias: { caddyfile: 'shellscript' },
				},
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/dorianverlaine/pingclair',
				},
			],
			editLink: {
				baseUrl: 'https://github.com/dorianverlaine/pingclair-docs/edit/main/',
			},
			sidebar: [
				{ label: 'Start', items: [{ autogenerate: { directory: 'start' } }] },
				{
					label: 'Concepts',
					items: [{ autogenerate: { directory: 'concepts' } }],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				{
					label: 'Project',
					items: [{ autogenerate: { directory: 'project' } }],
				},
			],
		}),
	],
});
