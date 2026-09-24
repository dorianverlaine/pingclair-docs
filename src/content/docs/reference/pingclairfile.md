---
title: Pingclairfile
h1_emoji: '📖'
description: How a Pingclairfile is structured, including lexical rules, site addresses, matchers, route order, snippets, and the tools that check it.
---

A Pingclairfile is Pingclair's configuration file, written in the Caddyfile
language: an optional global options block, then one block per site, each
holding directives. A Caddyfile that uses only supported directives loads
unchanged. This page describes the language; the
[directive reference](/reference/directives/) describes what each directive
does.

📌 This page describes **v0.2.0-rc.3**, the latest published release.

## 🔤 Lexical rules

| Rule | Detail |
| --- | --- |
| Comments | `#` to the end of the line. |
| Quoting | A value containing spaces is quoted with `"`. Quotes are removed before the value is parsed. |
| Durations | Written with a unit: `30s`, `5m`, `1h`. A bare number is refused where a duration is expected. |
| Case | Directive and option names are lowercase. |
| Placeholders | `{host}`, `{path}`, `{args[0]}`, `{block}`, and the rest of the placeholder set are expanded where the directive documents them. |

## 🌐 Addresses

A site block is named by its address. The address decides which port the site
listens on and whether it is served over HTTPS.

```text
example.com {          # HTTPS on 443 with a public certificate; 80 redirects
example.com:8443 {     # HTTPS on 8443: a host with a port is still HTTPS
localhost:8080 {       # HTTPS on 8080, from the internal authority
:8080 {                # plaintext HTTP on 8080, for any host
http://example.com {   # plaintext HTTP on 80
```

A host with a port and no scheme is served over HTTPS, as in Caddy. Write
`http://` in front of the address to ask for plaintext on any port. Two sites
that share a port must agree about TLS, or the configuration is refused.

## 🧭 Matchers

A matcher limits a directive to some requests. It is written inline, such as a
path like `/api/*`, or declared once as `@name` and referred to by that name.

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

A `handle` block groups directives into one route. Only the first matching
`handle` runs, and a `handle` with no matcher is the site's fallback.

`client_ip` matches the client address after `trusted_proxies` is applied.
**Next release:** `remote_ip` matches the connection's own peer instead, as in
Caddy; in v0.2.0-rc.3 both match the forwarded client.

## 🧭 Which route answers

In v0.2.0-rc.3, when several routes match a request, the one with the most
specific path answers, wherever it is written.

**Next release:** routes are tried in Caddy's directive order, and the first
match answers. For example, `respond` ranks ahead of `file_server`, so in the
site below `/assets/a.txt` gets `hello` instead of the file:

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

To keep a narrower route in front, wrap the routes in `handle` blocks, move a
directive with the global `order` option, or list them in a `route` block,
which keeps the written order.

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

`{args[0]}` is the first argument after the snippet name, and `{block}` is the
block the caller supplies. When the caller supplies no block, `{block}` expands
to nothing and the snippet still compiles.

## 🧰 Command-line tooling

Three commands help while writing a configuration:

- `pingclair validate` compiles the file and names the first problem.
- `pingclair adapt --pretty` prints the JSON the file compiles to.
- `pingclair fmt` formats the file.

[Command line](/reference/command-line/) lists every subcommand and flag.

## 🚫 What is not part of the language

The Caddyfile language defines more directives and options than Pingclair
implements. A name Pingclair recognizes but does not implement is refused when
the file loads, with a message naming the missing feature, so a configuration
never runs with a setting silently dropped. The server repository's README keeps
the full list, and [Project status](/project/status/) summarizes it.
