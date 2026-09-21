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
			logo: {
				src: './src/assets/logo.png',
				alt: 'Pingclair',
				// The artwork already carries the wordmark, so the site title next
				// to it would say the same thing twice.
				replacesTitle: true,
			},
			favicon: '/favicon.png',
			customCss: ['./src/styles/theme.css'],
			components: {
				// Adds the "Copy page" action next to the page title.
				PageTitle: './src/components/PageTitle.astro',
			},
			// The default locale lives at the site root, so it is configured under
			// the `root` key. Listing it as `en` instead would make Starlight look
			// for English pages in an `en/` directory and leave the sidebar empty.
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				// Both Chinese locales ship UI translations with Starlight, so
				// the locale keys are the standard ones rather than a bare `zh`.
				'zh-TW': { label: '繁體中文', lang: 'zh-TW' },
				'zh-CN': { label: '简体中文', lang: 'zh-CN' },
				ja: { label: '日本語', lang: 'ja' },
				ko: { label: '한국어', lang: 'ko' },
			},
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
				{
					label: 'Start',
					translations: {
						'zh-TW': '開始',
						'zh-CN': '开始',
						ja: 'はじめに',
						ko: '시작하기',
					},
					items: [{ autogenerate: { directory: 'start' } }],
				},
				{
					label: 'Concepts',
					translations: {
						'zh-TW': '核心概念',
						'zh-CN': '核心概念',
						ja: 'コンセプト',
						ko: '개념',
					},
					items: [{ autogenerate: { directory: 'concepts' } }],
				},
				{
					label: 'Reference',
					translations: {
						'zh-TW': '參考手冊',
						'zh-CN': '参考手册',
						ja: 'リファレンス',
						ko: '레퍼런스',
					},
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				{
					label: 'Project',
					translations: {
						'zh-TW': '專案資訊',
						'zh-CN': '项目信息',
						ja: 'プロジェクト',
						ko: '프로젝트',
					},
					items: [{ autogenerate: { directory: 'project' } }],
				},
			],
		}),
	],
});
