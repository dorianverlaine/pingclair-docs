---
title: Directives
h1_emoji: '🧾'
description: Syntax, defaults, context, refusals, and Caddy differences for the Pingclairfile directives and global options this reference covers.
---

Each entry opens with a fixed header: the syntax, the default when the
directive is absent, and where the directive may appear. It then says what the
directive does, what it refuses, and where it differs from Caddy.

📌 This page describes **v0.2.0-rc.3**, the latest published release. Where the
next release changes a behavior, the entry says so under **Next release**; that
behavior is on the server's `main` branch and not yet in a published build.

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
is a `basic_auth` without a block.

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode off
Default:  gzip in v0.2.0-rc.3; no compression in the next release
Context:  site block
```

Compresses responses. Formats are listed in preference order: when a client
accepts several, the first one listed wins. The supported formats are `zstd` and
`gzip`, and a bare `encode` means `gzip`. `encode off` turns compression off for
the site.

Refusals:

- `encode br` is refused at load time. The proxy has no streaming Brotli
  encoder, so the server will not silently fall back to gzip:
  `` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- An unknown format is refused with the list of valid ones.
- A path or named matcher is refused, because compression is set per site, not
  per route. The `*` matcher, which matches everything, is accepted.

Differences from Caddy: in v0.2.0-rc.3 a Pingclairfile site with no `encode`
line still compresses with gzip. Caddy compresses only where `encode` asks.

**Next release:** a site compresses only where `encode` asks, as in Caddy. A
site that relied on the old default must add `encode gzip` or
`encode zstd gzip`.

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse
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

Serves files from disk. It detects the MIME type, answers byte-range requests,
and sends `ETag` and `Last-Modified`. The files come from the site root set by
`root`, or from a root given to this directive alone.

- `index` names the files tried for a directory; the default is `index.html`.
- `browse` renders a listing for a directory that has no index file.
- `compress off` exempts this file server on a site that otherwise compresses.
- `precompressed` serves a sidecar such as `app.js.gz` when the client accepts
  that coding. With no arguments, the order is `br zstd gzip`.
- `hide` keeps the named paths from being served. Repeated lines add up.
- `status` answers every file with this status, for a maintenance page.
- `pass_thru` hands a missing file to the next handler instead of answering
  `404`.
- `disable_canonical_uris` stops the redirect that adds a trailing slash to a
  directory.

Refusals: `fs` is refused, because only the local file system is supported. A
`status` outside 100–599 and an unknown subdirective are refused.

Differences from Caddy: the positional `<root>` argument is a Pingclair
addition. In Caddy, a bare path after `file_server` is a path matcher. Prefer
`root` when the configuration must also load in Caddy.

**Next release:**

- `browse` takes an options block, and `file_limit <n>` caps how many entries a
  listing shows. A listing template, `reveal_symlinks`, and `sort` are refused by
  name.
- Methods other than `GET` and `HEAD` are answered `405` with
  `Allow: GET, HEAD`.
- Conditional requests are answered: a matching `If-None-Match` or a current
  `If-Modified-Since` gets `304`, and a failed `If-Match` or
  `If-Unmodified-Since` gets `412`.

```caddyfile
localhost:8080 {
    file_server ./public
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
prefix are accepted and change nothing.

Refusals:

- A directive that has both arguments and a block is refused.
- `header X-Name` with no value is refused. Caddy would set an empty value, but
  an empty response header is almost always a mistyped removal.
- A `match` response matcher inside the block is refused as not implemented.

⚠️ There is no `set` keyword. A block line `set X-Name value` is read as a
regular-expression replace on a header named `set`.

**Next release:** `Strict-Transport-Security` is sent only on encrypted
responses, and removed from every plaintext one, as RFC 6797 requires. Writing
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

## log

```text
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; named channels in global options
```

Writes an access log. The four forms mean different things:

- `log` enables the default access log for the site, on standard output.
- `log { … }` configures the site's access log.
- `log <name> { … }` adds a named logger to the site, with its own output.
- `log <name>` sends the site's records to a channel of that name declared in
  the global options with `log <name> { … }`.

Block options include `output` (`stdout`, `stderr`, or `file <path>`), `format`
(`json` or `console`), `level`, the `hostnames` selector, `include` and
`exclude` filters, `sampling`, and file rotation (`roll_size`, `roll_keep`,
`roll_keep_for`, `mode`, `dir_mode`, and the other `roll_*` options).

Refusals: a global channel may not use `hostnames`, because it is not attached
to a site. A channel declared twice is refused.

Records are batched before they are written. A sink that cannot keep up drops
records and counts them in `pingclair_access_log_dropped_total`.

**Next release:** an unnamed global `log { … }` block is refused. In
v0.2.0-rc.3 it is accepted and does nothing.

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
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
are spread over them; in v0.2.0-rc.3 the default is `round_robin`.

A hostname upstream is resolved again on the interval set by the global
`dns_refresh`, so a backend that restarts on a new address is followed without
a reload. A failed lookup keeps the previous address in rotation.

Active health checks probe each upstream out of band. A failed upstream leaves
rotation before a user request reaches it, and rejoins after the configured
number of successful probes. A `backup` upstream is used only when every
primary upstream is unavailable.

Refusals: an unknown option is refused with its full name, such as
`Unknown directive 'reverse_proxy: dial_timeout'`. Timeouts belong in a
`transport http` block.

**Next release:**

- The default `lb_policy` becomes `random`, which is Caddy's default. Write
  `lb_policy round_robin` to keep the current behavior.
- `lb_policy first` always picks the first available upstream. In v0.2.0-rc.3
  it behaves like `round_robin`.
- A `502` or `504` that Pingclair generates itself carries
  `Proxy-Status: pingclair; error=…`, so it can be told apart from one the
  backend sent.

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

The [reverse proxy guide](/guides/reverse-proxy/) walks through each option.

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle, route
```

Sets the site root: the directory that `file_server`, `try_files`, and the
other file-handling directives resolve paths against. `file_server` can take a
root of its own, but setting it here keeps every directive pointed at one
location.

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

Controls where the site's certificate comes from. Without a `tls` line, a public
name gets a certificate from Let's Encrypt automatically.

| Form | Behavior |
| --- | --- |
| `tls internal` | Issues from a persistent local certificate authority. Clients must trust its root; `pingclair trust` installs it. |
| `tls <cert> <key>`, or `cert` and `key` in the block | Uses certificate and key files issued elsewhere. |
| `tls { auto }` | Obtains a public certificate over ACME and renews it, which is also the default for a public name. |

The block also accepts `acme_email` (or `email`), `http3`, `default_sni`,
`client_auth`, and the DNS-01 options (`dns`, `resolvers`, `dns_ttl`,
`propagation_delay`, `propagation_timeout`, `dns_challenge_override_domain`).

`http3 off` takes this site out of HTTP/3. It does not create or remove the QUIC
listener; the global `servers { protocols … }` list decides that
([TLS: what you can tune](/guides/tls-tuning/#-which-protocols-are-served)).

Refusals:

- `dns` accepts only `cloudflare`. Any other provider is refused:
  ``DNS provider `route53` is not implemented; this build ships `cloudflare` only``.
- `protocols`, `ciphers`, `curves`, `alpn`, `on_demand`, `key_type`, `issuer`,
  and the other Caddy options not listed above are refused by name.
- `tls internal` cannot be combined with `auto`, an ACME email, or certificate
  files.

**Next release:**

- `http3 off` takes effect. In v0.2.0-rc.3 it is accepted and has no effect.
  The site's responses also stop advertising HTTP/3 in `Alt-Svc`.
- The internal authority's root moves to
  `<store>/pki/authorities/local/root.crt`, the layout Caddy uses. The old
  `<store>/internal/` tree is not migrated: a new authority is created, and
  clients must trust its root again.

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## Global options

Global options go in the unnamed block at the top of the file. Options that
Caddy nests under `servers { … }`, such as `protocols` and `trusted_proxies`,
are accepted there too.

| Option | Syntax | Notes |
| --- | --- | --- |
| `admin` | `admin [<address> [<token>]] \| off` | Enables the Admin API; the default address is `127.0.0.1:2019`. Without a token, only loopback clients are admitted. Without this option, there is no Admin API. |
| `auto_https` | `auto_https on \| off \| disable_redirects` | Controls automatic HTTPS and the port 80 redirect. `disable_certs` and `ignore_loaded_certs` are refused by name. |
| `dns_refresh` | `dns_refresh <duration> \| off` | Interval for resolving hostname upstreams again. The default is `30s`. `off` keeps the addresses resolved at startup. A bare number is refused. |
| `email` | `email <address>` | ACME account email. |
| `grace_period` | `grace_period <duration>` | How long a graceful stop waits for running requests. In v0.2.0-rc.3 a stop exits after about 250 ms regardless; **Next release:** the stop drains for up to this long. |
| `protocols` | `protocols h1 h2 h3` | Whether the HTTP/3 listener exists. See [TLS: what you can tune](/guides/tls-tuning/#-which-protocols-are-served). |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | Peers allowed to state the client address in forwarding headers. Changing it requires a restart. **Next release:** also accepts Caddy's spelling, `trusted_proxies static <cidr \| private_ranges> ...`. |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
