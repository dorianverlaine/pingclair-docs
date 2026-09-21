# Pingclair documentation

Source for the Pingclair documentation site. The site is built with
[Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/),
and is a separate repository from the server itself: documentation has to stay
reachable when the server is the thing being debugged.

## Requirements

- Node.js 24 (see `.node-version`)
- pnpm 12

## Local development

```bash
pnpm install
pnpm dev        # development server on http://localhost:4321
pnpm build      # static output in dist/
pnpm preview    # serve the contents of dist/
```

## Layout

```text
src/content/docs/start/       Installation and first configuration
src/content/docs/concepts/    How Pingclair works
src/content/docs/reference/   Configuration language and directives
src/content/docs/project/     Release status, limitations, benchmarks
src/content/docs/zh-TW/       Traditional Chinese mirror of the above
src/content/docs/zh-CN/       Simplified Chinese mirror of the above
src/styles/theme.css          Typography, colour, and layout tokens
src/assets/logo.png           Navigation logo, trimmed from the server repository
astro.config.mjs              Site metadata and sidebar structure
```

## Locales

The English pages are the root locale. Chinese pages live under `zh-TW/` and
`zh-CN/`, which are Starlight's built-in locale codes, so their interface
strings come from Starlight rather than from this repository.

Two details are easy to break:

- **Entry ids keep their case.** `src/content.config.ts` passes a custom
  `generateId` to `docsLoader`, because Astro's default lowercases entry ids.
  Without it, `zh-TW/` becomes `/zh-tw/` and Starlight can no longer match the
  locale, which silently sets `<html lang>` to the default locale.
- **Links between localized pages are absolute and prefixed.** A link from a
  Chinese page to another Chinese page is written `/zh-TW/...` or `/zh-CN/...`;
  Starlight does not rewrite in-content links.

## Writing rules

1. **American English, formal register.** No jokes and no exclamation marks:
   this is reference material, not a blog post. Emoji are allowed as structural
   markers on headings and notes, matching the server repository's README; use
   the same small set everywhere and never as decoration mid-sentence.
2. **Snippets must be valid.** Fence configuration blocks with `caddyfile`.
   Every snippet on the site has to validate against the release the page
   describes.
3. **Claims need evidence.** If a page states a behavior, that behavior exists
   in the release named at the top of the page. Link the release notes, the
   changelog, or the source when a claim is surprising.
4. **Document released behavior only.** Pages describe the latest published
   release. Unreleased behavior belongs in the changelog, not here.
5. **Do not copy private material.** Planning documents, host inventories, and
   raw benchmark evidence stay in the maintainer's working copy of the server
   repository.

## Deployment

The site is static and is intended to be published to Cloudflare Pages with the
build command `pnpm build` and the output directory `dist`. A copy served by
Pingclair itself is a reasonable mirror, but not the primary one: when the
server is misbehaving, its documentation is exactly what readers need.

## Related repositories

- [pingclair](https://github.com/dorianverlaine/pingclair) — the server
- [pingclair releases](https://github.com/dorianverlaine/pingclair/releases) — release notes and binaries
