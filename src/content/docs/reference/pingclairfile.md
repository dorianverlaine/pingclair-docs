---
title: Pingclairfile
h1_emoji: '📖'
description: How a Pingclairfile is structured, including lexical rules, site addresses, matchers, placeholders, route order, snippets, and the tools that check it.
---

A Pingclairfile is Pingclair's configuration file, written in the Caddyfile
language: an optional global options block, then one block per site, each
holding directives. A Caddyfile that uses only supported directives loads
unchanged. This page describes the language; the
[directive reference](/reference/directives/) describes what each directive
does.

📌 This page describes **v0.2.0**.

## 🔤 Lexical rules

| Rule | Detail |
| --- | --- |
| Comments | `#` to the end of the line. |
| Quoting | A value containing spaces is quoted with `"`. Quotes are removed before the value is parsed. |
| Blocks | A `{` that opens a block ends its line. `route { respond "hi"` on one line is refused. |
| Durations | Written with a unit: `30s`, `5m`, `1h`. A bare number is refused where a duration is expected. |
| Sizes | `kb`, `mb`, `gb`, and `tb` are powers of 1000; `kib`, `mib`, `gib`, and `tib` are powers of 1024. `10MB` is 10,000,000 bytes. |
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
http://example.com {   # plaintext HTTP on http_port (80 by default)
http://[::1]:8080 {    # plaintext HTTP for the host [::1]
*.example.com {        # one label: a.example.com, not a.b.example.com
```

- A host with a port and no scheme is served over HTTPS, as in Caddy. Write
  `http://` in front of the address to use plaintext HTTP on any port.
- An address with a scheme and no port, such as `https://example.com`, listens
  on the global `http_port` or `https_port`.
- A bracketed IPv6 address names a site, exactly as `127.0.0.1` does. A bracket
  that does not hold an IPv6 address, or that is followed by anything other
  than `:port`, is refused.
- `http://0.0.0.0:8080` is a catch-all for the port, like `http://:8080`.
- Host names are compared without regard to letter case and a trailing dot, so
  `Example.com` and `example.com.` reach the site named `example.com`.

### 🔌 One port is one listener

Sites that share a port share one socket, and the `Host` header selects
the site. A site with a specific address, such as `http://127.0.0.1:8080`, that
shares its port with a site listening on every interface is therefore reachable
on every interface by a client that sends its `Host`; give it a port of its own
if it must stay on loopback. Each such fold is logged when the configuration
loads.

The configuration is refused when sites on one port need different socket
policy: a site restricted by `bind` or `default_bind` beside one that listens
everywhere, a plaintext site beside a TLS site, or PROXY protocol on only one
of them.

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

How a path pattern matches:

- **Letter case is ignored** for ASCII letters: `/Admin/*` answers
  `/admin/users`. Use `path_regexp` when case must decide.
- **Escapes are decoded once** before the comparison: `/secret%21` matches
  `path /secret!`. A pattern written with an escape, such as `/a%20b`, must be
  written decoded (`"/a b"`) to match.
- **A `*` may appear anywhere.** A leading `*` matches a suffix at any depth
  (`*.php` matches `/x/y/index.php`), a `*` at each end matches a substring
  (`*/admin/*`), and a `*` elsewhere stays inside one path segment (`/a/*x`
  matches `/a/bx`, not `/a/b/cx`). `?`, `[…]`, and `\` are literal characters.
- **Braces are literal.** `/{id}` matches only that path; use `path_regexp` for
  captures.

The addresses a request comes from are matched by two different matchers:

- `client_ip` matches the client after `trusted_proxies` is applied: the
  forwarded address when the connection comes from a trusted proxy.
- `remote_ip` matches the connection's own peer, regardless of forwarding headers.
  Behind a trusted load balancer, that is the balancer.

A range that does not parse, such as `10.0.0.0/33`, is refused at load.

`handle`, `handle_path`, and `route` take at most one matcher token before
their block: `*`, a path that starts with `/`, or `@name`. Any other token is
refused.

## 🏷️ Placeholders for addresses

| Placeholder | Value |
| --- | --- |
| `{client_ip}`, `{http.request.client_ip}` | The client after `trusted_proxies` is applied. |
| `{remote_host}`, `{http.request.remote.host}` | The connection's peer address. |
| `{remote_port}`, `{http.request.remote.port}` | The connection's peer port. |
| `{remote}`, `{http.request.remote}` | The peer as `host:port`. |

`{remote_ip}` is not a placeholder and is refused at load, with a message that
names both replacements. Behind `trusted_proxies`, write
`header_up X-Real-IP {client_ip}` to forward the client's address.

## 🧭 Which route answers

A site's routes are tried as one list, ordered the way Caddy orders them, and
the first route that matches answers. The order comes from the directive, not
from where the line is written: `redir`, `handle`, and `route` rank ahead of
`respond`, which ranks ahead of `reverse_proxy`, `php_fastcgi`, and
`file_server`. In the site below, `/assets/a.txt` receives `hello` instead of the
file:

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

Between routes of the same directive:

1. The one whose single path is longer once a trailing `*` is removed goes
   first: `/foobar*` before `/foo`.
2. For paths that differ only by the trailing `*`, the exact path goes
   first: `/foo` before `/foo*`.
3. Otherwise, file order decides. Caddy sorts two different paths of equal
   length alphabetically instead.
4. A matcher with several paths, or none, goes after every single-path route.

A middleware directive written with a matcher, such as `basic_auth /admin/*` or
`header @api …`, applies authentication or header changes to every route that answers the requests it
matches, wherever the order puts that route.

To keep a narrower route in front, wrap the routes in `handle` blocks, move a
directive with the global `order` option (`order file_server first`), or list
them in a `route` block, which keeps the written order.

## 🧩 Snippets and imports

Snippets are reusable fragments. A snippet declared as `(name) { ... }` is
included with `import name`, and can receive a block from its caller:

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
to nothing and the snippet still compiles. Named sub-blocks are addressed as
`{blocks.<name>}`.

## 🧰 Command-line tooling

Three commands help while writing a configuration:

- `pingclair validate` compiles the file, reads the certificate files it names,
  and names the first problem.
- `pingclair adapt --pretty` prints the JSON the file compiles to, after the
  same validation.
- `pingclair fmt` formats the file with one tab per level, and exits with
  status 1 when the file was not already formatted.

[Command line](/reference/command-line/) lists every subcommand and flag.

## 🚫 What is not part of the language

The Caddyfile language defines more directives and options than Pingclair
implements. A name Pingclair recognizes but does not implement is refused when
the file loads, with a message naming the missing feature, and the configuration
is rejected.
[Project status](/project/status/#️-names-the-server-refuses-by-design) lists
those names.
