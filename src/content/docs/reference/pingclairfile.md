---
title: Pingclairfile
h1_emoji: '📖'
description: The configuration language, including file structure, addresses, matchers, snippets, and tooling.
---

The Pingclairfile is the configuration language. It follows Caddyfile
conventions: an optional global options block, then site blocks containing
directives. This page describes the language itself; the directives it accepts
are described in the [directive reference](/reference/directives/).

## 🔤 Lexical rules

| Rule | Detail |
| --- | --- |
| Comments | `#` to the end of the line. |
| Quoting | A value containing spaces is quoted with `"`. Quotes are removed before the value is parsed. |
| Durations | Written with a unit: `30s`, `5m`, `1h`. A bare number is refused where a duration is expected. |
| Case | Directive and option names are lowercase. |
| Placeholders | `{host}`, `{path}`, `{args[0]}`, `{block}`, and the rest of the placeholder set are expanded where the directive documents them. |

## 🌐 Addresses

A site block is named by an address. The address determines the listener and,
for public names, whether automatic HTTPS applies.

```caddyfile
example.com {              # host: ports 443 and 80, automatic HTTPS
localhost:8080 {           # host and port
:8080 {                    # any host on this port
http://example.com {       # force plaintext
```

The port belongs to the address rather than to a separate `listen` directive,
so the address and the listener cannot disagree.

## 🧭 Matchers

A directive that accepts a matcher applies only to matching requests. Matchers
are written inline or declared with `@name` and referenced by name.

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` blocks group directives per route; a `handle` with no matcher is the
fallback for its site.

## 🧩 Snippets and imports

Snippets are reusable fragments. A snippet declared as `(name) { ... }` is
pulled in with `import name`, and can receive a block from its caller:

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

A placeholder that receives nothing splices nothing, so a snippet written with
`{block}` still compiles when its caller supplies no block.

## 🧰 Command-line tooling

| Command | Purpose |
| --- | --- |
| `pingclair validate [path]` | Compile and check a configuration. Defaults to `./Pingclairfile`, then `./Caddyfile`. |
| `pingclair adapt --pretty` | Print the compiled JSON form of the configuration. |
| `pingclair fmt [--diff] [--overwrite]` | Format a Pingclairfile, or show the changes. |
| `pingclair run <path>` | Run the server with the given configuration. |
| `pingclair list-modules` | List the modules the binary was built with. |
| `pingclair build-info` | Print build metadata, including the toolchain used. |

## 🚫 What is not part of the language

The format defines more names than the server implements. A recognized name
that has no implementation is refused by name at load time, with a message
saying the feature is missing. The authoritative list of refused names lives in
the server repository's README, and the
[project status](/project/status/) page summarizes the categories.
