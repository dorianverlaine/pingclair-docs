---
title: Directives
h1_emoji: '🧾'
description: Syntax, defaults, and context for the directives this documentation covers.
---

Each entry states the syntax, the default when the directive is absent, and
where the directive may appear. Version attestation, the `Since:` line that
would state when a directive was introduced, is not published yet.

📖 This page documents a starting subset. Directives that are accepted but not
yet documented here are still validated by `pingclair validate`; a directive the
server does not implement is refused by name rather than accepted silently.

## encode

```text
Syntax:   encode <format> [<format> ...]
Default:  no compression
Context:  site block
```

Compresses responses. Arguments are listed in preference order, so the first
format the client accepts is used. Supported formats are `zstd` and `gzip`.

Asking for Brotli is a compile error rather than a silent downgrade to gzip:
the proxy has no streaming Brotli encoder, so the option cannot be honored.

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<root>]
Default:  disabled
Context:  site block
```

Serves files from disk, with MIME type detection, range requests, and ETag and
`Last-Modified` validation. The optional argument sets the root for this
directive alone. When it is omitted, the site root set by `root` is used.

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> <value>
          header [<matcher>] {
              <field> <value>      # set
              +<field> <value>     # append
              -<field>             # remove
              set <field> <value>  # set, spelled explicitly
          }
Default:  none
Context:  site block
```

Adds, replaces, or removes response headers. A bare field name sets the header;
prefixing the field with `+` appends and with `-` removes.

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
Syntax:   log [<name>] { <options> }
Default:  no access sink
Context:  site block, global options
```

Configures an access log sink. A bare `log` enables the default sink for the
site; `log <name> { ... }` configures a named logger, and `log <name>` without a
block refers to a channel declared in the global options.

Block options include the destination and format (`output`, `format`), the
`hostnames` selector, `include` and `exclude` filters, `sampling`, and file
rotation settings (`mode`, `dir_mode`, `roll_*`).

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

Records are batched before they are written, and a sink that cannot keep up
drops records and counts them in `pingclair_access_log_dropped_total`. Writing
every request to a system journal also carries the journal receiver's cost.

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] { ... }
Default:  none
Context:  site block
```

Forwards requests to one or more upstreams. The default load-balancing policy is
round robin. Hostname upstreams are re-resolved on the interval set by
`dns_refresh`, so a backend that restarts on a new address is followed without
an operator action; a failed lookup keeps the previous address in rotation.

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

Active health checks run out of band, so a failed backend leaves rotation
before a user request reaches it, and rejoins after the configured number of
successful probes. A `backup` upstream is used only when every primary upstream
is unavailable.

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block
```

Sets the site root. `file_server` can take a root of its own, but setting it
here is what lets the file server and other file-handling directives agree on a
single location.

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls <mode>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

Controls how certificates are obtained.

| Mode | Behavior |
| --- | --- |
| `tls auto` | Obtains public certificates over ACME and renews them. |
| `tls internal` | Issues from a persistent local certificate authority. The root is published at `$PINGCLAIR_TLS_STORE/internal/root.crt` and must be trusted by clients. |
| `tls { cert ...; key ... }` | Uses the certificate and key files named in the block. |

The block form also enables HTTP/3 with `http3`, and supports DNS-01 issuance
with `dns cloudflare <token>`, which is the only DNS provider implemented.
Naming another provider is refused at startup rather than accepted and ignored,
because DNS-01 is what makes wildcard certificates possible.

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
        http3
    }
    reverse_proxy localhost:3000
}
```

## 🌍 Global options

Global options are written in the unnamed block at the top of the file.

| Option | Syntax | Notes |
| --- | --- | --- |
| `admin` | `admin <address> [<token>]` | Admin API listener. Without a token, only loopback connections are accepted. |
| `auto_https` | `auto_https on \| off \| disable_redirects` | Controls automatic HTTPS and the port 80 redirect. |
| `dns_refresh` | `dns_refresh <duration>` | Re-resolution interval for hostname upstreams. `off` pins the addresses resolved at startup. |
| `email` | `email <address>` | ACME account email used for issuance. |
| `trusted_proxies` | `trusted_proxies <cidr> [<cidr> ...]` | Which peers may assert client identity headers. Changes require a restart. |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
