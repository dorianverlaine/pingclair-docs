---
title: Directives
h1_emoji: '🧾'
description: Syntax, defaults, context, refusals, and Caddy differences for the Pingclairfile directives and global options this reference covers.
---

📌 TLS examples below use `./certs/` in the working directory. Supply your own certificate, matching private key, or client CA file there; validation reads these files too.

Each entry opens with a fixed header: the syntax, the default when the
directive is absent, and where the directive may appear. It then describes what the
directive does, what it refuses, and where it differs from Caddy.

📌 This page describes **v0.2.0**. Behavior that changed from the 0.1.x line
and the 0.2.0 release candidates is marked **Changed in 0.2.0**;
[Upgrading](/start/upgrade/#️-what-changes-in-020) collects those changes in one
place.

📖 The page covers a subset of the language. A directive that is not listed here
is still checked by `pingclair validate`, and a directive the server does not
implement is refused by name rather than accepted and ignored.

## basic_auth

```text
Syntax:   basic_auth [<matcher>] [bcrypt|argon2id [<realm>]] {
              <username> <hashed_password>
              ...
          }
Default:  no authentication
Context:  site block, handle, route
```

Requires HTTP Basic credentials before the request goes further. Each block line
is one account: a username and a password hash, never the password itself.
`pingclair hash-password` produces the hash
([Command line](/reference/command-line/#pingclair-hash-password)).

The algorithm on the directive line is the one every hash in the block is checked
against, and it defaults to `bcrypt`. Any other algorithm name is refused, and so
is a `basic_auth` without a block. A line whose hash is not a valid hash of the
declared algorithm, including a plaintext password, is refused at load.

A `basic_auth` written with a matcher protects every route that answers the
requests it matches, including a `respond` or `reverse_proxy` that the directive
order ranks ahead of it. A `redir` still answers before it, as in Caddy.

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## bind

```text
Syntax:   bind <host>
Default:  every interface ([::]), or the global default_bind
Context:  site block
```

Restricts every listener of the site to one host address. The host replaces the
host part of each address the site listens on, for TCP, TLS, and HTTP/3, and
`pingclair adapt` shows the resulting addresses. An IPv6 host is written with or
without brackets and is bracketed in the listener: `bind ::1` listens on
`[::1]:443`.

The automatic HTTP redirect listener of an HTTPS site also listens on the
`bind` host, so it is not reachable through other interfaces.

Refusals:

- More than one address is refused:
  `` `bind 127.0.0.1 ::1` names 2 addresses, and this build binds one ``.
  Use one address, `[::]` for every interface, or one site per interface.
- A bound site that shares its port with a site listening on every interface is
  refused, because one port is one socket and the bound site would become
  reachable on interfaces `bind` excluded. Bind every site on that port to the
  same address, or move one of them to another port.

Differences from Caddy: Caddy binds every listed address. Pingclair puts each
listener on one interface and refuses the second address instead of ignoring it.

**Changed in 0.2.0:** `bind` applies to a site with an explicit address or port,
such as `http://example.test:8080`. Before, it applied only to a site without
an address of its own, and the site listened on every interface.

```caddyfile
http://example.test:8080 {
    bind 127.0.0.1
    respond "loopback only"
}
```

## cache

```text
Syntax:   reverse_proxy <upstream> {
              cache {
                  ttl       <duration>
                  max_size  <bytes>
              }
          }
Default:  disabled; max_size 134217728 when enabled
Context:  reverse_proxy block
```

This Pingclair option enables the H1/H2 proxy response cache. `ttl` is required
and supplies a fallback lifetime; `max_size` is a positive integer byte budget
shared by all caching routes. Conflicting budgets, zero, and unknown options
are refused. Reload resizes the store, evicts immediately when shrinking, and
drains it when caching is removed.

Freshness includes upstream `Age`, apparent age from `Date`, and response delay.
`Expires` is measured relative to `Date`. Every `Vary` field line and the request
fields it names participate in variants; invalid `Vary` and `Vary: *` prevent
storage. Request `no-cache` and `no-store` are recognized by directive name
across all field lines. SSE and `flush_interval -1` bypass admission.

```caddyfile
http://:8080 {
    reverse_proxy 127.0.0.1:3000 {
        cache {
            ttl 30s
            max_size 134217728
        }
    }
}
```

Without a usable origin lifetime, `ttl` applies only to `200`. Silent `404`
and `410` responses live for at most ten seconds or the shorter TTL; silent
server errors are not stored. `206`, `428`, `429`, `431`, and `511` are never
stored. The cache keeps origin bytes and compresses per client afterward.
Hits and misses both apply `header_down`. HTTP/3 does not use this response cache.

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode [*] {
              gzip            [<level>]
              zstd
              minimum_length  <bytes>
              match {
                  status  <codes...>
                  header  <field> [<value>]
              }
          }
          encode off
Default:  no compression
Context:  site block
```

Compresses responses. Formats are listed in preference order: when a client
accepts several with the same quality, the first listed format is selected. The supported
formats are `zstd` and `gzip`, and a bare `encode` means `gzip`. `encode off`
turns compression off for the site.

- `gzip <level>` sets the gzip level, 1 to 9. The default level is 5. `zstd`
  uses level 3.
- `minimum_length` is the smallest body that is compressed; the default is
  512 bytes.
- `match` limits compression to responses with these statuses or headers. An
  explicit `match` block replaces the default content-type list.

What compression does to a response:

- Responses on a site with `encode` carry `Vary: Accept-Encoding`, including
  the ones sent uncompressed. Compression adds `Accept-Encoding` to an existing
  `Vary` field instead of replacing it.
- A proxied response with a strong `ETag` receives a weak validator when it is
  re-encoded, because the encoded bytes differ from the origin's.
- `Cache-Control: no-transform` on the request or on the response disables
  compression for that response.
- `Accept-Encoding: *` does not select a coding; the client receives the
  uncompressed body unless it names `gzip` or `zstd`.
- A static file larger than 8 MiB is sent uncompressed. Use a precompressed
  sidecar (`file_server { precompressed }`) to serve a large file compressed.

Static and proxy encoding use the same default content-type allow-list.
`identity` participates in quality negotiation. Partial and bodiless proxy
responses are not compressed; transformed responses drop obsolete digest
fields and H3 integrity trailers. A compression failure aborts the response
rather than appending plaintext.

Refusals:

- `encode br` is refused at load time. The proxy has no streaming Brotli
  encoder, and the server does not automatically substitute gzip:
  `` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- An unknown format, or an unknown setting inside the block, is refused.
- `encode off` with a block is refused.
- A path or named matcher is refused, because compression is set per site, not
  per route. The `*` matcher, which matches everything, is accepted.

**Changed in 0.2.0:** a site compresses responses only when `encode` is configured, as in Caddy.
A site that relied on the earlier gzip default must add `encode gzip` or
`encode zstd gzip`. The block settings take effect; earlier releases compiled
every block as plain gzip.

```caddyfile
example.com {
    encode {
        zstd
        gzip 6
        minimum_length 1024
    }
    file_server
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse {
                  file_limit <n>
              }
              compress              [off|false]
              precompressed         [br|zstd|gzip ...]
              hide                  <paths...>
              status                <code>
              pass_thru
              disable_canonical_uris
              etag_file_extensions  <extensions...>
          }
Default:  disabled
Context:  site block, handle, route
```

Serves files from disk. It detects the MIME type, answers byte-range and
conditional requests, and sends `ETag` and `Last-Modified`. The files come from
the site root set by `root`, or from a root given to this directive alone.

- `index` names the files tried for a directory; the default is `index.html`.
  An index must be a relative filename.
- `browse` renders a listing for a directory that has no index file.
  `file_limit` caps the entries shown; the default ceiling is 10,000.
- `compress off` exempts this file server on a site that otherwise compresses.
- `precompressed` serves a sidecar such as `app.js.gz` when the client accepts
  that coding. With no arguments, the order is `br zstd gzip`. Sidecars are
  served only when this option is present.
- `hide` keeps the named paths from being served or listed. A pattern without
  a `/` hides any path component of that name (`.git` hides `/a/.git/b`); a
  pattern with a `/` is a path under the root. Repeated lines are combined.
- `status` answers every file with this status, for a maintenance page.
- `pass_thru` passes a missing file request to the next handler instead of answering
  `404`.
- `disable_canonical_uris` stops the redirect that adds a trailing slash to a
  directory.

Conditional requests follow RFC 9110: a matching `If-None-Match` or a current
`If-Modified-Since` receives `304`, a failed `If-Match` or `If-Unmodified-Since`
receives `412`, and a `Range` with an `If-Range` that no longer matches receives the
whole file with `200`. Methods other than `GET` and `HEAD` are answered `405`
with `Allow: GET, HEAD`. Static responses carry `Vary: Accept-Encoding` whether
or not the site compresses.

Refusals: `fs` is refused, because only the local file system is supported. A
`status` outside 100–599, an unknown subdirective, an index that is absolute or
contains `..`, a browse template, `reveal_symlinks`, `sort`, and a `hide`
pattern whose `[` set never closes are refused.

Differences from Caddy: the positional `<root>` argument is a Pingclair
addition. In Caddy, a bare path after `file_server` is a path matcher. Prefer
`root` when the configuration must also load in Caddy.

**Changed in 0.2.0:** `ETag` values are built from the nanosecond modification
time and differ per content coding, so every static `ETag` changes once on
upgrade and caches revalidate each file one time.

```caddyfile
localhost:8080 {
    file_server ./public
}
```

Precompressed sidecars use their own size and modification time for ETags and
take precedence over cached live compression; gzip validators include quality.
Ranges stream in bounded identity chunks. Static body caches share byte budgets
and a 16,384-entry ceiling, including empty files. Canonical redirects clean
the path, escape backslashes, and preserve the query rather than forming a
reference to another host. A configured `ETag` header is currently not used for
revalidation.

## forward_auth

```text
Syntax:   forward_auth <upstream> {
              uri <path>
              copy_headers <fields...>
              transport http {
                  tls
                  tls_server_name <name>
                  tls_trusted_ca_certs <files...>
                  tls_client_auth <cert> <key>
                  tls_insecure_skip_verify
              }
          }
Default:  no authentication subrequest
Context:  site block, handle, route
```

Makes a bodyless GET subrequest to the authentication service with the original
method and URI. A 2xx copies the configured identity headers before continuing;
other responses stream to the client. Each destination header is removed before
copying, even when renamed. `transport http` accepts only the listed TLS
options. Unsupported options, missing client key pairs, and combining custom
CAs with skipped verification are refused. Keep certificate verification enabled
unless disabling it is an explicit requirement.

```caddyfile
http://:8080 {
    forward_auth https://auth.example.com {
        uri /check
        copy_headers Remote-User
        transport http {
            tls_server_name auth.example.com
        }
    }
    reverse_proxy 127.0.0.1:3000
}
```

## handle

```text
Syntax:   handle [<matcher>] {
              <directives...>
          }
Default:  none
Context:  site block, handle, route, handle_errors
```

Groups directives into one route. Sibling `handle` blocks are mutually
exclusive: only the first matching block runs, even when that block writes no
response. Blocks with a path sort the way routes do (see
[Which route answers](/reference/pingclairfile/#-which-route-answers)), and a
`handle` with no matcher is the fallback. Every directive inside one block runs,
in directive order.

The matcher token is `*`, a path that starts with `/`, or a named matcher
(`@name`). Anything else is refused:
``expected at most one matcher (`*`, a path starting with `/`, or `@name`) before the block, got `*.php` ``.

**Changed in 0.2.0:** an unrecognized token used to be dropped, so
`handle *.php { … }` answered every request on the site. Write
`@php path *.php` and `handle @php { … }`.

```caddyfile
example.com {
    @php path *.php
    handle @php {
        respond "PHP" 200
    }
    handle {
        respond "Not PHP" 200
    }
}
```

## handle_errors

```text
Syntax:   handle_errors [<status|Nxx> ...] {
              <directives...>
          }
Default:  the built-in error text, or the site's error_page
Context:  site block
```

Runs a route when the request ended in an error status. The arguments are exact
three-digit statuses or `Nxx` ranges, combined with OR; with no arguments the
block catches every error. Inside the block, `{err.status_code}` and the other
`{err.*}` placeholders describe the error.

Errors reach the block when a handler raises them (`error`, or `file_server`
with a missing file) and when the server produces them itself: a
`reverse_proxy` that cannot reach its upstream (`502`, `503`, `504`), a body
over the `request_body` limit (`413`), and a body that stops arriving (`408`).

- `root` inside the block sets the error route's own document root; it may
  appear anywhere in the block. A matcher-scoped `root @name …` is refused.
- A `file_server` inside the block serves from the error route's
  configuration. The page is returned with the error status, and the failed
  request's `Range` and validators are ignored, so an error never becomes a
  `206` or a `304`.
- An error raised inside an error route is answered directly instead of
  running the error routes again.

**Changed in 0.2.0:** gateway and body-size errors reach `handle_errors`, and a
`file_server` in an error route serves its page instead of the error text. A
catch-all `handle_errors { … }` therefore also answers `502`, `504`, and `413`;
Specify status codes to restrict the errors handled. Its gateway
answers carry no `Proxy-Status` field, which the built-in gateway error does.

```caddyfile
example.com {
    reverse_proxy 127.0.0.1:3000
    handle_errors 502 503 504 {
        root * /srv/errors
        rewrite * /{err.status_code}.html
        file_server
    }
}
```

## handle_path

```text
Syntax:   handle_path <path-matcher> {
              <directives...>
          }
Default:  none
Context:  site block, handle, route
```

Works like `handle`, and also removes the matched path prefix before the
directives inside run: `handle_path /api/*` forwards `/api/users` as `/users`.
The prefix comparison ignores ASCII letter case, like the route that chose the
block, so `handle_path /API/*` also strips `/api` from `/api/users`. The same
matcher-token rule as `handle` applies.

```caddyfile
example.com {
    handle_path /api/* {
        reverse_proxy 127.0.0.1:3000
    }
}
```

## header

```text
Syntax:   header [<matcher>] <field> [<value> [<replacement>]]
          header [<matcher>] {
              <field> <value>                  # set
              +<field> <value>                 # append
              -<field>                         # remove
              ?<field> <value>                 # set only if absent
              <field> <search> <replacement>   # regular-expression replace
              match {
                  status  <codes...>
                  header  <field> [<value>]
              }
              defer
          }
Default:  none
Context:  site block, handle, route
```

Changes response headers. A bare field name sets the header, a `+` prefix
appends a value, and a `-` prefix removes the field. A `?` prefix sets the value
only when the response does not already carry the field. With three arguments,
the second is a regular expression and the third replaces what it matches.

Headers are always applied to the finished response, so `defer` and the `>`
prefix are accepted and change nothing. A `match` block inside a `header` block
makes the whole block conditional on the finished response's status (`404`,
`2xx`) or headers.

Refusals:

- A directive that has both arguments and a block is refused.
- `header X-Name` with no value is refused. Caddy would set an empty value, but
  an empty response header is ambiguous with an intended header removal.
- A field value containing CR, LF, or NUL, or a field name that is not a valid
  token, is refused at load (RFC 9110 §5.5).
- A `match` block inside `handle_response { header { … } }` is refused.

⚠️ There is no `set` keyword. A block line `set X-Name value` is read as a
regular-expression replace on a header named `set`.

`Strict-Transport-Security` is sent only on encrypted responses and is removed
from every plaintext one, as RFC 6797 requires. Writing
`header Strict-Transport-Security "max-age=…"` is the way to turn HSTS on.

```caddyfile
example.com {
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -X-Powered-By
    }
}
```

## limits

```text
Syntax:   limits {
              header_timeout          <duration>
              body_timeout            <duration>
              idle_timeout            <duration>
              request_timeout         <duration>
              max_headers             <count>
              max_header_bytes        <bytes>
              max_connections         <count>
              upload_bytes_per_sec    <bytes>
              download_bytes_per_sec  <bytes>
              long_connections {
                  idle_timeout     <duration|off>
                  request_timeout  <duration|off>
              }
          }
Default:  header_timeout 60s; a body may pause 60s between reads
Context:  site block
```

Sets the resource limits of a site's connections and requests. `limits` is a
Pingclair directive; Caddy has no equivalent.

- `header_timeout` bounds the whole request header, from the moment the
  connection is accepted, or the previous keepalive request ends, to its last
  byte. The default is 60 seconds. An idle HTTP/1 keepalive connection is
  therefore closed after 60 seconds without a request, and an HTTP/3 request
  stream whose header is incomplete after that time is reset with
  `H3_REQUEST_INCOMPLETE`.
- `body_timeout` is the longest pause allowed between two reads of a request
  body. Without it, the pause is bounded at 60 seconds. A client that stops
  sending is answered `408`; an HTTP/2 upload through `reverse_proxy` has its
  stream reset instead. WebSocket and immediate-flush routes keep only a
  configured value.
- `long_connections` overrides `idle_timeout` and `request_timeout` for
  WebSocket and streaming routes; `off` removes the deadline.

**Changed in 0.2.0:** both 60-second defaults are new. A client that is quiet
for longer on purpose, such as a gRPC client stream, needs an explicit
`body_timeout`, or `flush_interval -1` on its route.

```caddyfile
example.com {
    limits {
        header_timeout 30s
        body_timeout 2m
    }
    reverse_proxy 127.0.0.1:3000
}
```

## listen

```text
Syntax:   listen [http://|https://]<address> [proxy_protocol]
Default:  the listeners named by the site address
Context:  site block
```

Adds a listener to the site. `listen` is a Pingclair directive, read the way
nginx reads its own: `listen 127.0.0.1:8080` and `listen [::1]:8080` bind that
address; `listen :8080`, `listen 8080`, and `listen *:8080` bind every
interface; and an address without a port takes the HTTP port, or the HTTPS port
with `https://`. `proxy_protocol` requires a PROXY protocol header on that
listener. A site whose `listen` names an address does not inherit
`default_bind`.

Refusals: a hostname (`listen` binds and never resolves), an IPv6 address
without brackets, a port that is not a number from 0 to 65535, an unknown flag,
and an address that disagrees with the site's `bind`.

**Changed in 0.2.0:** `listen` keeps the address it names. Earlier releases kept
only the port, so `listen 127.0.0.1:8080` listened on every interface. Write
`listen :<port>` to keep listening everywhere.

```caddyfile
http://:8080 {
    listen 127.0.0.1:9090
    respond "two listeners"
}
```

## log

```text
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; global options
```

Writes an access log. The site-level forms mean different things:

- `log` enables the default access log for the site, on standard output.
- `log { … }` configures the site's access log.
- `log <name> { … }` adds a named logger to the site, with its own output.
- `log <name>` sends the site's records to a channel of that name declared in
  the global options with `log <name> { … }`.

In the global options block, an unnamed `log { … }` configures the server's
own process log instead: `output file <path>`, `output stdout`,
`output stderr`, `format json|text`, and `level`. A file sink is created with
mode `0600` if it is missing. `RUST_LOG` takes precedence over a configured `level`,
and the startup banner stays on standard output.

Block options include `output` (`stdout`, `stderr`, or `file <path>`), `format`
(`json` or `console`), `level`, the `hostnames` selector, `include` and
`exclude` filters, `sampling`, and file rotation (`roll_size`, `roll_keep`,
`roll_keep_for`, `mode`, `dir_mode`, and the other `roll_*` options). Each JSON
access record carries a `ts` field: seconds since the Unix epoch at which the
request began.

Refusals: a global channel may not use `hostnames`, because it is not attached
to a site. A channel declared twice is refused.

Records are batched before they are written. A sink that cannot keep up drops
records and counts them in `pingclair_access_log_dropped_total`.

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

## metrics

```text
Syntax:   metrics [<matcher>] [{ disable_openmetrics }]
Default:  no metrics route
Context:  site block, handle, route
```

Serves the Prometheus scrape endpoint from a site route, so a scraper can read
the numbers without access to the Admin API. The route has the same access restrictions as the site; on a public site,
restrict it with a matcher or `basic_auth`.

The route serves the numbers only while collection is on, which the global
`metrics` option controls (see [Global options](#global-options)). With
collection off, it answers `200` with an empty body.

```caddyfile
{
    metrics
}

http://:9180 {
    bind 127.0.0.1
    metrics /metrics
}
```

## php_fastcgi

```text
Syntax:   php_fastcgi [<matcher>] <upstream...> {
              root                  <path>
              split                 <suffix...>
              index                 <filename|off>
              try_files             <candidates...>
              env                   <name> <value>
              resolve_root_symlink
              dial_timeout          <duration>
              read_timeout          <duration>
              write_timeout         <duration>
              capture_stderr
          }
Default:  disabled; split .php; index index.php
Context:  site block, handle, route
```

Expands file matching and rewriting into a FastCGI proxy. The upstream is a
FastCGI service such as PHP-FPM. Reverse-proxy options are also accepted where
supported. Request-body buffering policy reaches the FastCGI transport; script
paths retain non-UTF-8 filename bytes, and repeated Cookie lines are combined.
HEAD sends no body, download pacing applies, parameters too large for a FastCGI
record return `431`, and truncated or malformed bodies abort the response.

⚠️ Chunked and bodyless requests still receive `411`. This runtime limitation is not detected by configuration validation. See
[Known defects](/project/status/#-known-defects-in-020).

```caddyfile
http://:8080 {
    root * /srv/php
    php_fastcgi 127.0.0.1:9000 {
        read_timeout 30s
        write_timeout 30s
    }
    file_server
}
```

## request_body

```text
Syntax:   request_body [<matcher>] {
              max_size       <size>
              read_timeout   <duration>
              write_timeout  <duration>
              set            <body>
          }
Default:  no size limit
Context:  site block, handle, route
```

Bounds or replaces the request body.

- `max_size` refuses a larger body with `413`, whether its length was declared
  or it streamed past the limit. Sizes follow the SI/IEC split: `10MB` is
  10,000,000 bytes and `10MiB` is 10,485,760.
- `read_timeout` and `write_timeout` bound reading the body and writing the
  response for this route. A stalled upload is answered `408`.
- `set` replaces the body with the given text, after placeholders are expanded.
  The client's own bytes are discarded as they arrive rather than buffered.

A site-level `request_body` without a matcher applies to every request in the
site, including requests answered inside `handle` blocks. A `request_body`
inside a `handle` overrides it for that route.

**Changed in 0.2.0:** there is no request-body limit unless one is configured.
Earlier releases refused proxied bodies over 1 MiB by default.

```caddyfile
example.com {
    request_body {
        max_size 10MB
    }
    reverse_proxy 127.0.0.1:3000
}
```

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] [<upstream> ...] { ... }
Default:  none
Context:  site block, handle, route
```

Forwards requests to one or more upstreams. `lb_policy` chooses how requests
are spread over them; the default is `random`, which is Caddy's default.
`lb_policy first` sends every request to the first available upstream.

A hostname upstream is resolved again on the interval set by the global
`dns_refresh`, so a backend that restarts on a new address is followed without
a reload. A failed lookup keeps the previous address in rotation.

Active health checks probe each upstream out of band. A failed upstream leaves
rotation before a user request reaches it, and rejoins after the configured
number of successful probes. A `backup` upstream is used only when every
primary upstream is unavailable. An upstream weight of `0` drains it: it
receives no requests.

Configure timeouts in a `transport http` block: `connect_timeout` (Caddy's
`dial_timeout`), `first_byte_timeout` (Caddy's `response_header_timeout`),
`read_timeout`, and `write_timeout`. `lb_try_duration` limits how long after the
request arrived a new attempt may start; it does not terminate an active response.

A `502` or `504` that Pingclair generates itself carries
`Proxy-Status: pingclair; error=…`, on the built-in error path. Custom `handle_errors` responses omit it too;
absence alone does not identify a backend response. Once the upstream may have seen a request, an automatic retry repeats only
idempotent methods.

Refusals:

- An unknown option is refused with its full name, such as
  `Unknown directive 'reverse_proxy: dial_timeout'`.
- A weight above 100 is refused, and so is a pool in which every primary
  upstream has weight 0.
- The `transport http` options without an equivalent in this build
  (`read_buffer`, `write_buffer`, `max_conns_per_host`, `keepalive_interval`,
  and the others Caddy inherits from Go's HTTP client) are refused by name.

**Changed in 0.2.0:**

- The default `lb_policy` is `random`; write `lb_policy round_robin` to keep
  the earlier alternation.
- `lb_try_duration` no longer terminates a slow response or a long event stream. Bound
  a slow backend with `first_byte_timeout` or `read_timeout` instead.
- Behind `trusted_proxies`, `{remote_host}` is the connection's peer and
  `{client_ip}` is the client. `header_up X-Real-IP {client_ip}` forwards the
  client.

```caddyfile
:80 :8080 {
    reverse_proxy {
        lb_policy least_conn
        to 10.0.0.1:8080 {
            weight 3
        }
        to 10.0.0.2:8080
        to 10.0.0.3:8080 {
            backup
        }
        health_check {
            path /health
            interval 5s
            timeout 2s
            status 200 204
            consecutive_failure 3
            consecutive_success 2
        }
    }
}
```

The [reverse proxy guide](/guides/reverse-proxy/) explains each option.

`request_buffers <size|unlimited>` and `response_buffers <size|unlimited>`
buffer before forwarding, then stream the remainder after the ceiling. Here
`unlimited` still has an 8 MiB memory ceiling. Sizes use SI/IEC units, so
`1MB` and `1MiB` differ. Request buffering also reaches FastCGI.
`flush_interval -1` flushes immediately and bypasses response-cache admission.

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle_errors
```

Sets the site root: the directory that `file_server`, `try_files`, and the
other file-handling directives resolve paths against. `file_server` can take a
root of its own, but setting it here keeps every directive pointed at one
location. Inside `handle_errors`, `root` sets the error route's own root.

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

Refusals: `root` inside an ordinary `handle` or `route` is not supported.
Path-scoped and named-matcher roots are also refused. Use `root * <path>`
at site level or inside `handle_errors`.

## route

```text
Syntax:   route [<matcher>] {
              <directives...>
          }
Default:  none
Context:  site block, handle, route
```

Runs the directives inside in the order they are written, instead of the
directive order. Use it when a narrower directive must run ahead of a broader
one that the directive order ranks first. The same matcher-token rule as
`handle` applies.

```caddyfile
example.com {
    route {
        file_server /assets/*
        respond "fallback" 200
    }
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls <email>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

Controls where the site's certificate comes from. Without a `tls` line, a public
hostname receives a certificate from Let's Encrypt automatically.

| Form | Behavior |
| --- | --- |
| `tls internal` | Issues from a persistent local certificate authority: a root, and an intermediate that signs the 90-day leaves. Clients must trust its root; `pingclair trust` installs it. |
| `tls <cert> <key>`, or `cert` and `key` in the block | Uses certificate and key files issued elsewhere. `validate` reads both files and refuses a pair that does not match. |
| `tls <email>` | Sets the ACME account email and keeps automatic issuance. |
| `tls { auto }` | Obtains a public certificate over ACME and renews it, which is also the default for a public name. |

The block also accepts `acme_email` (or `email`), `http3`, `default_sni`,
`client_auth`, `renewal_window_ratio`, and the DNS-01 options (`dns`,
`resolvers`, `dns_ttl`, `propagation_delay`, `propagation_timeout`,
`dns_challenge_override_domain`).

Every address of a site has a certificate: `tls internal` issues one leaf per
name, and a `tls <cert> <key>` pair answers for each of the site's names. A
`*.example.com` site orders one wildcard certificate, which covers exactly one
label.

`http3 off` takes this site out of HTTP/3: its QUIC handshake is refused and
its responses do not advertise HTTP/3 in `Alt-Svc`, while other sites on the
port keep it. It does not create or remove the QUIC listener; the global
`servers { protocols … }` list decides that
([TLS: what you can tune](/guides/tls-tuning/#-which-protocols-are-served)).

`client_auth` follows the most specific site for the name the client sent, as
the certificate does: an exact site without `client_auth` does not request a client
certificate even when a wildcard site on the same port does. A client
certificate whose usage extensions exclude client authentication is refused.

`client_auth` also accepts `verifier leaf file <paths...>`, `verifier leaf
folder <directory>`, or a block containing leaf loaders. It pins the presented
leaf after chain verification. Folders are scanned recursively for `.pem`
files and rescanned on reload; other verifier modules are refused.

Refusals:

- `dns` accepts only `cloudflare`. Any other provider is refused:
  ``DNS provider `route53` is not implemented; this build ships `cloudflare` only``.
- `protocols`, `ciphers`, `curves`, `alpn`, `on_demand`, `key_type`, `issuer`,
  and the other Caddy options not listed above are refused by name.
- `tls internal` cannot be combined with `auto`, an ACME email, or certificate
  files.
- Certificate files on a site with no name, or on the `_` site, are refused.

**Changed in 0.2.0:** the internal authority's files moved to
`<store>/pki/authorities/local/`, the layout Caddy uses. The old
`<store>/internal/` tree is not migrated: a new authority is created, and
clients must trust its root again.

```caddyfile
example.com {
    tls {
        cert ./certs/example.com.pem
        key ./certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## try_files

```text
Syntax:   try_files <candidates...> {
              policy first_exist|first_exist_fallback|smallest_size|largest_size|most_recently_modified
          }
Default:  no rewrite; policy first_exist
Context:  site block, handle, route
```

Selects a file candidate and rewrites the request to it. Every positional
argument is a candidate, including the first path; this directive takes no
matcher token. Candidates use the configured root, support placeholders and
globs, and retain non-UTF-8 filename bytes. `=404` is an error fallback.
Unknown policies and unsafe paths are refused.

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

## uri

```text
Syntax:   uri [<matcher>] strip_prefix <prefix>
          uri [<matcher>] strip_suffix <suffix>
          uri [<matcher>] path_regexp <pattern> <replacement>
Default:  unchanged URI
Context:  site block, handle, route
```

Changes the request path. Prefix and suffix removal ignore ASCII letter case,
matching path routing and `handle_path`. Operands resolve placeholders before
the operation; regular-expression replacements use `$1` for a capture.
`${1}` is read as the placeholder `{1}`, so it does not preserve the capture.
Unknown operations, wrong argument counts, blocks, and invalid regular
expressions are refused.

```caddyfile
http://:8080 {
    uri path_regexp ^/old/(.*)$ /new/$1
    reverse_proxy 127.0.0.1:3000
}
```

## Global options

Global options go in the unnamed block at the top of the file. Options that
Caddy nests under `servers { … }` are accepted there.

| Option | Syntax | Notes |
| --- | --- | --- |
| `acme_dns` | `acme_dns cloudflare <token>` | Global Cloudflare DNS-01 credentials; other providers are refused. |
| `client_ip_headers` | `client_ip_headers <field> ...` | Ordered client-identity sources, also supported inside `servers`; only trusted peers may supply them. |
| `default_sni` | `default_sni <name>` | Certificate name for a client without SNI, including HTTP/3; an explicit unknown name is still refused. |
| `ocsp_stapling` | `ocsp_stapling off` | Accepted because this build does not staple OCSP. Bare and `on` forms are refused. |
| `renewal_window_ratio` | `renewal_window_ratio <ratio>` | Renewal window as a fraction of certificate lifetime; a site may override it in `tls`. |
| `admin` | `admin [<address> [<token>]] [{ origins …; enforce_origin }] \| off` | Enables the Admin API; the default address is `127.0.0.1:2019`. With a token, requests must send `Authorization: Bearer <token>`; without one, only loopback clients are admitted. Without this option, there is no Admin API ([Admin API](/reference/admin-api/)). |
| `auto_https` | `auto_https on \| off \| disable_redirects \| ignore_loaded_certs` | Controls automatic HTTPS and the port 80 redirect. `disable_redirects` leaves the automatic HTTP port unbound. `disable_certs` is refused by name. |
| `default_bind` | `default_bind <host>` | The `bind` host for every site that names none and whose `listen` entries name no address. One address only. |
| `dns_refresh` | `dns_refresh <duration> \| off` | Interval for resolving hostname upstreams again. The default is `30s`. `off` keeps the addresses resolved at startup. A bare number is refused. |
| `email` | `email <address>` | ACME account email. |
| `grace_period` | `grace_period <duration>` | How long a graceful stop lets running requests finish. The default is `30s`. The process exits as soon as the last request ends. |
| `http_port`, `https_port` | `http_port <port>` | The ports that scheme-only addresses (`http://example.com`, `https://example.com`) and automatic HTTPS use. The defaults are 80 and 443. |
| `log` | `log [<name>] { … }` | An unnamed block configures the process log; a named block declares an access-log channel ([`log`](#log)). |
| `metrics` | `metrics [{ per_host; observe_catchall_hosts }]` | Turns metrics collection on. Without it, nothing is collected and the scrape endpoints answer empty. `per_host` adds a `host` label for the hosts the configuration serves. |
| `order` | `order <directive> first\|last\|before <d>\|after <d>` | Moves a directive in the directive order. |
| `servers` | `servers [<address>] { … }` | Listener options: `protocols`, `trusted_proxies static …`, `client_ip_headers`, `listener_wrappers { proxy_protocol }`, and `metrics`. An addressed block applies to that one listener and may set only those options. |
| `storage` | `storage file_system <path>` | The directory of the TLS store. Takes precedence over `PINGCLAIR_TLS_STORE`. Other storage modules are refused. |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | Peers allowed to state the client address in forwarding headers. Inside `servers { … }`, write Caddy's spelling, `trusted_proxies static <cidr \| private_ranges> ...`. One line per scope. |

Inside `servers`, `client_ip_headers <field> ...` lists the headers that may
name the client, in order. Without it, the client comes from `X-Forwarded-For`
and `Forwarded`, with `X-Real-IP` when neither was sent.

**Changed in 0.2.0:**

- `CF-Connecting-IP` names the client only when `client_ip_headers` lists it.
- Metrics are collected only when `metrics` is set.
- `trusted_proxies` inside `servers` requires the `static` module name, and a
  second `trusted_proxies` line in the same scope is refused.
- `bind` and `default_bind` with more than one address are refused.

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
    servers {
        trusted_proxies static 173.245.48.0/20
        client_ip_headers CF-Connecting-IP
    }
}
```

📚 The [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) records the evidence and complete 0.2.0 upgrade list.

⚠️ Restart the service after changing global `metrics`. Applying this change
through `/load` returns `409 restart_required`. See
[runtime_listeners.rs](https://github.com/dorianverlaine/pingclair/blob/main/pingclair/src/runtime_listeners.rs).
