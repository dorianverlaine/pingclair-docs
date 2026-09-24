# AGENTS.md - pingclair-docs

Operating rules for this repository. They apply to every agent and to every
edit, including one-line fixes.

## What this repository is

The published documentation site for Pingclair. It contains prose, not server
code; the server lives in `~/code/pingclair`. Nothing here is generated from the
server repository yet, so accuracy is maintained by review rather than by a
build step.

📡 **The site is also an API for agents, and that is a deliverable.** Every page
is published as Markdown, `/mcp` and `/a2a` answer documentation queries, and a
dozen discovery documents under `/.well-known/` describe them. `pnpm scan:agents`
checks that surface against the public agent-readiness scan and must report
**level 5 with only the documented failures**. Read
[Keeping the site agent friendly](#keeping-the-site-agent-friendly) before
touching `worker/`, `public/`, `robots.txt`, or anything under `src/pages/`.

## Commands

```bash
pnpm install     # install dependencies (pnpm is the only supported manager)
pnpm dev         # development server
pnpm build       # must pass before handoff
pnpm preview     # serve dist/
pnpm scan:agents # agent-readiness of the published site; run before handoff
```

`pnpm build` is the gate. A page that does not build is not delivered.

### When Expressive Code settings change

Astro caches rendered pages under `.astro/` and `node_modules/.astro/`, and the
cached HTML keeps the stylesheet link it was rendered with. After changing
`expressiveCode` in `astro.config.mjs`, that link can point at a hash the build
no longer emits: the page then loads without any Expressive Code styles, which
shows up as code blocks with no padding, a misplaced copy button, and wrong
colors. Move both cache directories aside and build again:

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

### Never drop the custom `generateId`

`src/content.config.ts` passes a case-preserving `generateId` to `docsLoader`.
Astro's default slugifies entry ids, which lowercases the locale directory, and
Starlight matches locales by that directory name. Without it, `zh-TW/` and
`zh-CN/` stop matching their locale keys: the Chinese pages are replaced by
English fallbacks that carry an "untranslated" notice.

## Content rules

- **Register:** American English, formal, third person for description and
  second person for instructions. No humor and no exclamation marks.
- **Published prose:** use neutral, literal, professional language. State the
  condition and the observable result directly. Avoid conversational rhetoric,
  blame-oriented wording, and unsupported generalizations such as "everyone"
  or "nobody."
- **System behavior:** do not personify software when a precise result is
  available. Write that the server accepted, rejected, applied, returned, or
  logged something rather than describing what it thought, wanted, knew, or
  said.
- **Terminology:** use the current official product or UI term for a named
  control, state, or feature. For example, use Cloudflare's "DNS-only record,"
  not an informal color-based name. Verify terminology against current official
  documentation when it may have changed.
- **Spelling:** use American spelling in authored English prose. Preserve the
  original spelling in exact command output, logs, API responses, error
  messages, and quotations.
- **Page titles carry one emoji** through the `h1_emoji` frontmatter field, which
  keeps the heading in step with the emoji-marked sections below it without
  putting emoji into the sidebar, the browser tab, the previous/next links, or
  `llms.txt`. The same page uses the same emoji in every locale.
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

### Copy-edit English before handoff

For every change to published English prose:

1. Read the prose once without the code blocks and verify that each sentence
   names a concrete subject and result.
2. Check American spelling and replace conversational generalizations,
   anthropomorphic system behavior, blame-oriented language, and vague
   pronouns.
3. Confirm third-party product terminology against the current UI or official
   documentation when the term is material to the instruction.
4. Keep literal logs, command output, API responses, error messages, and
   quotations unchanged, even when their spelling or tone differs from the
   surrounding prose.
5. Run `pnpm build`; a successful build does not replace this prose review.

## Locales

- The default locale is the `root` key, not `en`. Naming it `en` makes Starlight
  look for English pages under `en/`; the English sidebar then renders empty
  while the localized sidebars keep working.
- English is the root locale. The other two live in `zh-CN/` (Simplified
  Chinese) and `zh-TW/` (Traditional Chinese). Their directory names use the
  standard Starlight locale codes so the built-in UI translations, `<html
  lang>`, and CJK typography rules all match.
- The language menu is built from the `locales` object in `astro.config.mjs` in
  insertion order, so that object *is* the menu order. The agreed order is
  English, Simplified Chinese, Traditional Chinese.
  A new locale means: add it to that object, add its label map to
  `src/components/PageTitle.astro`, `ThemeSelect.astro`, and `Footer.astro`,
  add it to `otherLocales` in `src/pages/llms.txt.ts` and
  `llms-full.txt.ts`, and translate every page.
- Keep the three trees structurally identical: same page paths, same headings,
  same anchors. Directive entry headings stay in English in every locale
  (`## reverse_proxy`) because other pages link to those anchors, and so do the
  `Syntax:` / `Default:` / `Context:` labels inside their code fences.
- Code-block comments stay in English in every locale. The snippets are shared
  with the server repository and are read as configuration, not as prose.
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

## Adding or changing a page

A page is not finished when it renders. Six locale trees, four generated
surfaces, and three agent endpoints read from the same content, so the work ends
when all of them agree. In order:

1. **Write the English page first**, then port it into `zh-CN/` and `zh-TW/` at
   the same path. Never add a page to one tree only:
   a missing translation falls back to English with an "untranslated" notice,
   and a partial tree is what makes readers distrust the localized site.
2. **Fill the frontmatter.** `title` names the page in the sidebar and the
   search index; `description` is what `/llms.txt` and `/mcp-index.json` show
   an agent before it fetches anything, so it has to say what the page is for;
   `h1_emoji` carries the page's one emoji, the same one in every locale.
3. **Keep anchors stable.** Someone links to `#reverse_proxy` and to
   `/reference/directives/#tls`. Renaming a heading or moving a section is a
   breaking change for those links, so translate headings rather than renaming
   them, and if a heading must change, update every locale and every page that
   links to it.
4. **Build.** `pnpm build` must pass, and it is the gate for the generated
   surfaces: the Markdown twins, `llms.txt`, `llms-full.txt`, `mcp-index.json`,
   the sitemap, and the Pagefind index are all written during it.
5. **Check the agent surfaces for that page:**

   ```bash
   pnpm build
   pnpm preview --port 4321 &          # serves dist/ on a fresh port
   PAGE=/start/quickstart               # the page path without a trailing slash
   for l in "" zh-CN/ zh-TW/; do
     [ -f "dist/$l$PAGE.md" ] || echo "MISSING dist/$l$PAGE.md"
   done
   curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
     -H 'Accept: text/markdown' "http://127.0.0.1:4321$PAGE/"
   curl -s http://127.0.0.1:4321/llms.txt | grep -c "$PAGE.md"
   ```

   The Markdown twinned path is `<path>.md` for ordinary pages and
   `<path>/index.md` for a directory page (`/zh-TW/`, `/zh-CN/`). `llms.txt`
   indexes English pages only, which is deliberate; the localized pages are
   reachable under their own prefix.

6. **If the page changes what an agent can do**, update the machine-readable
   surface in the same commit: `/openapi.json` for a new endpoint,
   `public/.well-known/agent-skills/*/SKILL.md` plus its `sha256:` digest for a
   new skill, `public/auth.md` for anything about access.

## Verifying a start page

Everything under `start/` is a procedure, not an essay: the reader runs the
commands on a machine that matters to them. So every command on those pages was
run on a real host before the page shipped, and the outputs quoted on the page
are the ones that host printed. The existing start pages were written this way,
and the routine is short enough to repeat:

- **Use throwaway hosts, never the maintainer's machines.** Two cheap instances
  in one cloud region, one on Ubuntu and one on Fedora, so both the `apt` and
  the `dnf` branches of `scripts/install.sh` are exercised. Set the hostname to
  `pingclair` inside each, so the transcripts copied into a page read cleanly.
- **Install the way the page tells a reader to install.** The published
  installer (`curl … | sudo bash`), not a local build, because the page
  documents what a reader gets.
- **Walk the page top to bottom on the Ubuntu host**, then walk the
  distribution-specific parts again on Fedora. Where reality differs from the
  draft, the machine wins and the page is corrected — the first draft of the
  HTTPS page claimed DNS-01 worked because the configuration was accepted, and
  the run is what proved it does not.
- **Quote the host's output, not the intended output.** The `text` blocks that
  show logs and headers are copied from the run. If a step cannot be verified —
  it needs another provider, a second host, or a live authority — say so in the
  page and in the commit rather than leaving it implied.
- **When the run shows that a documented feature does not work, the page says
  what actually happens and the defect gets an issue.** A page that promises the
  intended behavior is worse than one that reports the observed behavior, and
  the issue is what keeps the observed behavior from becoming permanent.
- **Keep the transcripts local.** The commit's `Verified:` line names the
  distribution, the version, and the commands that were run. No addresses,
  instance identifiers, or host inventories.
- **Destroy the hosts, their security group, their key pair, and any temporary
  DNS records when the pages are done.** A claim that outlives its machine is a
  claim nobody can re-check, and throwaway instances left running are somebody's
  bill.

## Keeping the site agent friendly

This site is published twice: once as pages for people, and once as an API for
agents. That second surface is a product feature, not a side effect, and every
change has to leave it working. What exists, and what breaks it:

| Surface | File | Invariant |
| --- | --- | --- |
| `robots.txt` | `public/robots.txt` | RFC 9309 rules plus `Content-Signal: ai-train=yes, search=yes, ai-input=yes` and the `Agentmap:` line. Never add a rule that blocks `/_astro/`: a crawler that cannot fetch CSS and JS cannot render the page it is reading. |
| Sitemap | `astro.config.mjs` | `/sitemap.xml` is a copy of the index Starlight writes, produced by the `sitemap-alias` integration. That integration must stay **after** Starlight in the array: build hooks run in order, and the first attempt copied a file that did not exist yet. |
| Markdown index | `src/pages/llms.txt.ts`, `llms-full.txt.ts` | English only, generated from the collection, so a new English page appears by itself. Update `otherLocales` when a locale is added. |
| Markdown twins | `src/pages/[...slug].md.ts` | One twin per page per locale, at the page path plus `.md`. The "Copy page" button and `/mcp`'s `read_page` both fetch these; never delete the case-preserving `generateId` that makes their paths match the rendered routes. |
| Content negotiation | `worker/index.js` | `Accept: text/markdown` on a page URL answers with the twin, `content-type: text/markdown`, and `x-markdown-tokens`. HTML responses carry `vary: accept`. The candidate list (`<path>.md`, then `<path>/index.md`) is derived from the twin layout, so changing that layout changes the worker in the same commit. A page URL without the trailing slash is served directly for `GET` and `HEAD` rather than redirected, because some agent fetch stacks do not follow redirects. |
| Plain-text twins | `public/_headers`, `src/lib/docs-endpoints.ts` | Both `.md` and `.txt` answer `text/plain`, because several agent fetch stacks reject `text/markdown` outright; the `Accept: text/markdown` negotiation keeps the real media type for clients that ask for it. Changing one twin's type without the other leaves an agent surface that only some fetchers can read. |
| Documentation MCP server | `worker/index.js`, `/.well-known/mcp/server-card.json` | `POST /mcp` answers `initialize`, `tools/list`, and `tools/call` for `search_docs`, `read_page`, and `list_pages`, over the index at `/mcp-index.json`. The card's tool list and the worker's `TOOLS` array must not drift apart. |
| Lookup agent | `worker/index.js`, `/.well-known/agent-card.json` | `POST /a2a` answers `message/send` with a completed task listing matching pages. It retrieves and never generates prose; the card says so, and the code has to keep that true. |
| Catalogs | `/.well-known/ai-catalog.json`, `/.well-known/api-catalog`, `/openapi.json` | Discovery documents list what actually exists. Adding an endpoint without adding it to `openapi.json` makes the catalog lie. |
| DNS-AID | Cloudflare DNS, `pingclair.com` zone | Three SVCB/HTTPS records — `_mcp`, `_a2a`, and `_index` under `_agents` — point at the origin with ALPN and port hints, so an agent can find the MCP and A2A endpoints without fetching a page. They live in the dashboard rather than in this repository, the zone is DNSSEC-signed, and `pnpm scan:agents` fails if they disappear. |
| Skills | `public/.well-known/agent-skills/` | `index.json` carries a `sha256:` digest of every `SKILL.md`. Editing a skill without recomputing it publishes a file that fails its own integrity check: `shasum -a 256 public/.well-known/agent-skills/<name>/SKILL.md`. |
| Browser tools | `public/webmcp.js` | Registers `search_pingclair_docs` and `read_pingclair_page` for browsers that implement WebMCP, and calls `/mcp` so there is one search implementation. Feature-detect, never assume the API exists. |
| Access statement | `public/auth.md` | States that the site is anonymous and issues no credentials. This site operates no OAuth authorization server, so it publishes no OAuth metadata: inventing one would send agents to a dead end. |
| Retired hostname | `wrangler.toml`, `worker/index.js` | `pingclair.aqeo.dev` stays bound as a custom domain, and every request on it is a permanent redirect to `pingclair.com`: a 301 for `GET` and `HEAD`, a 308 for anything else so an agent posting to `/mcp` keeps its method and body. Dropping the route or the hostname check silently retires every link written before the move. |

`wrangler.toml` sets `run_worker_first = true`, which is what lets the worker
see a page request before the assets server answers it. Removing it does not
break the build or the tests; it silently disables Markdown negotiation, the
MCP server, and the A2A endpoint in production. Keep it.

### Verify agent-friendliness, cheapest first

```bash
pnpm build && pnpm preview --port 4321 &
for p in /robots.txt /sitemap.xml /llms.txt /llms-full.txt /auth.md \
         /.well-known/agent-skills/index.json /.well-known/mcp/server-card.json \
         /.well-known/agent-card.json /.well-known/ai-catalog.json \
         /.well-known/api-catalog /openapi.json /webmcp.js; do
  printf '%-46s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "http://127.0.0.1:4321$p")"
done
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  -H 'Accept: text/markdown' http://127.0.0.1:4321/
curl -s -X POST http://127.0.0.1:4321/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq -c '.result.serverInfo'
```

Anything that touches the worker, the discovery documents, or `robots.txt` also
gets the published scan, and the release check is **level 5 with no unexpected
failure**. That scan needs network access to isitagentready.com, so the
repository ships it as a script that encodes the expected result and exits
non-zero when the result changes:

```bash
pnpm scan:agents                      # the published site
pnpm scan:agents http://127.0.0.1:8788  # a local `wrangler dev`, if the checks under test need the worker
```

`scripts/agent-readiness.mjs` holds the expected-failure list, so a documented
failure stays documented in one place instead of in everyone's memory. Three
checks are expected to stay failed, and none of them is a defect to fix here:
`oauthDiscovery`, `oauthProtectedResource`, and `authMd` want OAuth metadata for
an authorization server this site does not operate. Do not "fix" them by
publishing metadata for a server that does not exist, and do not widen the list
to make a failing check pass: adding a new entry means the site stopped doing
something it used to do.

## Traps that already cost a build or a check

- **A colon in a frontmatter value breaks the build.** `description: Le langage
  de configuration : structure…` fails with `bad indentation of a mapping
  entry`, because YAML reads the `: ` as a new mapping. Rewrite the sentence
  without the colon or quote the whole value.
- **`wrangler dev` writes `.wrangler/`**, which is local state, not content:
  it is gitignored, and `git add -A` after a dev run used to sweep miniflare
  databases into a commit.
- **The worker caches `/mcp-index.json` for the isolate's lifetime.** A content
  change reaches `/mcp` only after a deployment, which is what pushing to `main`
  does; there is no cache to purge.
- **`public/` is copied verbatim.** A file added there is published whether or
  not any page links to it, which is how `auth.md`, the `.well-known/`
  documents, and `webmcp.js` reach production.

## Client-side behavior

Interactive affordances ship as small Astro components with a plain `<script>`
- no framework integration - and register through Starlight's `components`
override map. The "Copy page" action in `src/components/PageTitle.astro` is the
reference implementation: it fetches the page's own `.md` endpoint, copies the
text, and reports success or failure in the button label in the page's locale.

Anything that needs to fetch generated files must have a matching endpoint under
`src/pages/`; do not scrape the rendered DOM for content that already exists as
Markdown.
