# AGENTS.md - pingclair-docs

Operating rules for this repository. They apply to every agent and to every
edit, including one-line fixes.

## What this repository is

The published documentation site for Pingclair. It contains prose, not server
code; the server lives in `~/code/pingclair`. Nothing here is generated from the
server repository yet, so accuracy is maintained by review rather than by a
build step.

## Commands

```bash
pnpm install     # install dependencies (pnpm is the only supported manager)
pnpm dev         # development server
pnpm build       # must pass before handoff
pnpm preview     # serve dist/
```

`pnpm build` is the gate. A page that does not build is not delivered.

### When Expressive Code settings change

Astro caches rendered pages under `.astro/` and `node_modules/.astro/`, and the
cached HTML keeps the stylesheet link it was rendered with. After changing
`expressiveCode` in `astro.config.mjs`, that link can point at a hash the build
no longer emits: the page then loads without any Expressive Code styles, which
shows up as code blocks with no padding, a misplaced copy button, and wrong
colours. Move both cache directories aside and build again:

```bash
mv .astro /tmp/astro-cache && mv node_modules/.astro /tmp/astro-cache-nm
pnpm build
```

Then confirm every stylesheet the HTML references exists:

```bash
for f in $(grep -o '_astro/[A-Za-z0-9._-]*\.css' dist/index.html | sort -u); do
  [ -f "dist/$f" ] || echo "MISSING $f"
done
```

## Content rules

- **Register:** American English, formal, third person for description and
  second person for instructions. No humor and no exclamation marks.
- **Emoji:** allowed as structural markers, in the same spirit as the server
  repository's logs and README. Use them as heading prefixes, callout markers,
  and list bullets; keep to a small reused set (🚀 🧠 📖 📊 🛡️ ⚠️ 📌 🌐 📦 🐳 🧭
  🔁 🔒 ✅ 🚫) and never place them inside a sentence for decoration.
- **Anchor stability:** directive entry headings in `reference/directives.md`
  stay plain (`## reverse_proxy`) because other pages link to their anchors.
- **Structure:** one idea per sentence, one topic per page, headings that read
  as statements rather than labels when possible.
- **Fences:** configuration uses `caddyfile`; shell uses `bash`; file contents
  use `text`. Never fence configuration as `pingclair` - the server repository's
  documentation tests recognize `pingclair` and `caddyfile`, and the site uses
  the latter for syntax highlighting.
- **Snippets:** every snippet must be valid for the described release. Prefer
  snippets copied from the server repository's `README.md` or `examples/`
  directory, which are compile-tested there.
- **Claims:** link to the release notes or a source file when a statement is
  surprising or load-bearing. Do not state a performance number without naming
  the measurement conditions in the same page.
- **Versioning:** pages describe the latest published release and say so. When
  a page documents something that arrived recently, name the version inline.

## Locales

- The default locale is the `root` key, not `en`. Naming it `en` makes Starlight
  look for English pages under `en/`; the English sidebar then renders empty
  while the localized sidebars keep working.
- English is the root locale. Chinese pages live under `src/content/docs/zh-TW/`
  (Traditional) and `src/content/docs/zh-CN/` (Simplified); both are Starlight
  locale codes, so their UI strings are built in.
- Keep the three trees structurally identical: same page paths, same headings,
  same anchors. Directive entry headings stay in English in every locale
  (`## reverse_proxy`) because other pages link to those anchors.
- Chinese pages use mainland terminology in `zh-CN` (文件, 配置, 服务器, 端口,
  证书) and Taiwan terminology in `zh-TW` (檔案, 設定, 伺服器, 連接埠, 憑證).
  A character-level conversion is not a translation.
- Never rename the locale directories to lowercase: `zh-tw/` breaks Starlight's
  locale matching, which also breaks `<html lang>` and the CJK typography rules
  in `src/styles/theme.css`.

## Never publish

Planning documents, internal audits, host inventories, credentials, IP
addresses of private infrastructure, raw benchmark evidence, and anything under
the server repository's local-only paths (`docs/STATUS.md`, `docs/SITE.md`,
`benchmarks/results/`, `.plan-snapshots/`).

## Page skeleton

Task pages: goal, prerequisites, steps, verification, failure modes.

Concept pages: the problem, the model, the consequences, links to reference.

Reference entries: a fixed header (`Syntax`, `Default`, `Context`) followed by
what the directive does, how invalid input is refused, differences from
expected Caddyfile behavior, and a working example.

## Client-side behavior

Interactive affordances ship as small Astro components with a plain `<script>`
- no framework integration - and register through Starlight's `components`
override map. The "Copy page" action in `src/components/PageTitle.astro` is the
reference implementation: it fetches the page's own `.md` endpoint, copies the
text, and reports success or failure in the button label in the page's locale.

Anything that needs to fetch generated files must have a matching endpoint under
`src/pages/`; do not scrape the rendered DOM for content that already exists as
Markdown.
