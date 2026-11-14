---
title: Route TCP with Layer 4
h1_emoji: '🔌'
sidebar:
  order: 6
description: Route raw TCP connections by TLS ClientHello SNI or ALPN and source IP, use bounded proxying and dynamic DNS, and observe Layer 4 sessions.
---

Layer 4 routing forwards a raw TCP connection without terminating TLS. Pingclair
reads the beginning of a TLS ClientHello when a route needs SNI or ALPN
metadata, selects one route, replays the bytes it read, and relays both
directions without interpreting the application protocol.

This guide describes the Layer 4 support introduced in **v0.3.0-alpha.1**. The
configuration uses a Caddy-style `layer4` block; forwarding limits use nginx
stream terminology and semantics.

## 🧾 Before you start

- Pingclair `v0.3.0-alpha.1` or newer on Linux
  ([Install](/start/install/)).
- A TCP service that accepts TLS itself. The examples use
  `127.0.0.1:9443`.
- A listener port that is not used by an HTTP site, the Admin API, or another
  process. The examples use port `8443`.
- The service stopped while you edit its configuration:
  `sudo pc service stop`.

## 🧠 How Layer 4 routing works

Pingclair accepts a TCP connection, applies the global and listener source-IP
block lists, prereads a bounded TLS ClientHello when a route requires it,
selects the first matching route, and connects to that route's upstream. The
preread bytes are written to the upstream in their original order before any
unread client bytes are relayed.

TLS is not terminated. The upstream receives the client's ClientHello and
performs the handshake. HTTP headers, HTTP/2 frames, HTTP/3 packets, and other
application-protocol content remain opaque bytes at this layer.

## 📌 Syntax compatibility

The configuration follows the shape of a caddy-l4 `layer4` block. This table
identifies the forms that `v0.3.0-alpha.1` accepts:

| Form | Support |
| --- | --- |
| `layer4 { … }` in global options | Supported. |
| An address block such as `:8443 { … }` | Supported with one numeric IP address and port per block. |
| `@name tls`, `sni`, `alpn`, and `remote_ip` | Supported for TLS presence, exact SNI values, case-sensitive ALPN identifiers, and IP or CIDR peer matches. |
| `route [@name …] { proxy … }` | Supported. Routes follow declaration order and the first match wins. |
| `proxy host:port` | Supported with one static source. A static hostname is resolved at load or reload. |
| `proxy { dynamic a { … } }` | A Pingclair extension for background DNS refresh. It is not a general caddy-l4 handler. |
| Other caddy-l4 matchers, handlers, and proxy options | Refused during validation. |

Each listener block owns one prebound socket and its own admission count,
forwarding limits, and logger. When the same policy is needed on more than one
address, declare one listener block for each address. Several routes can still
share a single listener.

## 🔌 Route TLS by SNI

The following configuration sends TLS connections for
`app.example.com` to a backend that terminates TLS:

```caddyfile
{
    admin off
    auto_https off
    layer4 {
        :8443 {
            @app tls sni app.example.com
            route @app {
                proxy 127.0.0.1:9443
            }
        }
    }
}
```

`tls sni` compares the complete Server Name Indication value without regard to
ASCII letter case. A connection with another SNI value does not match this
route.

An `alpn` condition is case-sensitive:

```caddyfile
{
    layer4 {
        :8443 {
            @api tls {
                sni api.example.com
                alpn h2
            }
            route @api {
                proxy 127.0.0.1:9444
            }
        }
    }
}
```

Conditions in one matcher block are combined with AND. A route that names
several matcher sets combines those sets with OR.

## 🧭 Add a source-address route and fallback

`remote_ip` matches the TCP peer. It does not use forwarding headers:

```caddyfile
{
    layer4 {
        :8443 {
            @local remote_ip 127.0.0.1/8 ::1
            route @local {
                proxy 127.0.0.1:9443
            }

            route {
                proxy 127.0.0.1:9444
            }
        }
    }
}
```

Routes are evaluated in declaration order. The unconditional final route
matches every connection that earlier routes did not claim. When no route
matches, Pingclair closes the connection.

Do not treat a preread timeout as a fallback. A connection that does not send a
complete ClientHello within `preread_timeout` is closed.

## ⏱️ Set forwarding limits

Listener settings appear before the routes:

```caddyfile
{
    layer4 {
        :8443 {
            max_connections 2048
            preread_timeout 10s
            preread_buffer_size 16k
            proxy_connect_timeout 5s
            proxy_timeout 10m
            proxy_buffer_size 16k
            proxy_half_close on

            @app tls sni app.example.com
            route @app {
                proxy 127.0.0.1:9443
            }
        }
    }
}
```

| Setting | Default | Behavior |
| --- | --- | --- |
| `max_connections` | `1024` | Concurrent sessions admitted on this listener. The accepted range is 1 through 4096. A process-wide limit of 4096 also applies. |
| `preread_timeout` | `30s` | Maximum time to classify one connection. A timeout closes the connection. |
| `preread_buffer_size` | `16k` | Maximum ClientHello bytes retained for classification. |
| `proxy_connect_timeout` | `60s` | Total time allowed for upstream connection attempts. |
| `proxy_timeout` | `600s` | Maximum inactivity between reads or writes in either direction. |
| `proxy_buffer_size` | `16k` | Capacity of each relay direction. |
| `proxy_half_close` | `off` | When enabled, EOF shuts down only the corresponding write direction. |

Layer 4 sizes use binary `k` and `m` units. A duration without a suffix is a
number of seconds.

## 🌐 Use a dynamic DNS source

A `proxy` normally names one static address. A `dynamic a` block resolves an
A or AAAA source in the background and publishes a bounded address pool:

```caddyfile
{
    layer4 {
        :8443 {
            @app tls sni app.example.com
            route @app {
                proxy {
                    dynamic a {
                        name backend.example.com
                        port 9443
                        versions ip
                        valid 30s
                        stale 60s
                        allow_ip 10.0.0.0/8
                    }
                }
            }
        }
    }
}
```

`valid` overrides the DNS answer's freshness lifetime. `stale` permits a
previously published snapshot to remain available for at most 300 seconds.
The address policy rejects the complete answer if any address is outside the
allowed set.

A static hostname is resolved only at load or reload. Use `dynamic a` when a
DNS record changes without a configuration reload. Without `allow_ip`, a
dynamic source accepts public unicast destinations only; an internal DNS
source requires an explicit CIDR.

## 📊 Observe Layer 4 sessions

Global `metrics` enables Layer 4 collection. The existing HTTP `metrics`
endpoint exposes those counters. A listener can also write one access record
when a session ends:

```caddyfile
{
    metrics
    layer4 {
        :8443 {
            log {
                output file /var/log/pingclair/layer4-access.log
                format json
            }

            route {
                proxy 127.0.0.1:9443
            }
        }
    }
}

http://127.0.0.1:9090 {
    metrics /metrics
}
```

The `l4_*` metric families report connections, active sessions, bytes,
durations, preread failures, upstream connection failures, DNS refreshes, and
address attempts. See the [directive reference](/reference/directives/#layer4)
for the listener options and matcher forms.

## 🧪 Validate and test

Validate the file before replacing the running configuration:

```bash
pingclair validate /etc/Pingclair/Pingclairfile
```

Start Pingclair with that file:

```bash
sudo pingclair run -c /etc/Pingclair/Pingclairfile
```

With a TLS backend listening on `127.0.0.1:9443`, request the routed name:

```bash
openssl s_client \
  -connect 127.0.0.1:8443 \
  -servername app.example.com \
  -quiet </dev/null
```

The output shows the certificate chain presented by the backend. Pingclair
forwards the encrypted bytes and does not present its own certificate on this
listener. Stop the foreground process and run `sudo pc service start` when the
test is complete.

## 🔁 Reloads and listener changes

A reload applies route changes to new Layer 4 connections. Established tunnels
keep the route, upstream socket, buffers, and limits with which they started.

Changing a listener address, its HTTP or Admin port overlap, or its
`max_connections` value requires a restart. A failed reload leaves the previous
Layer 4 configuration in service.

## ⚠️ Failure modes

- **No matching route:** Pingclair closes the TCP connection.
- **Preread timeout or overflow:** Pingclair closes the connection and does not
  use a fallback upstream.
- **No address in a dynamic pool:** new connections to that route are refused.
- **Local descriptor or memory exhaustion:** a healthy backend is not marked
  unavailable merely because the local proxy could not create a socket.
- **Listener already in use:** startup fails instead of moving the listener to
  another port.

## 🚫 Alpha boundaries

This alpha supports TCP only. It does not support UDP, TLS termination,
PROXY protocol on either side, wildcard SNI matching through `layer4`, or
weighted load balancing.

Each listener block names one address, each route names one static or dynamic
upstream, and each route body contains one `proxy` handler. The syntax follows
the structure of a caddy-l4 `layer4` block, but this is a deliberately bounded
TCP subset rather than full caddy-l4 compatibility. Unsupported options are
refused during validation.

## 🧭 Related pages

- [Pingclairfile](/reference/pingclairfile/): the file structure around global
  options and site blocks.
- [Directive reference](/reference/directives/#layer4): listener options,
  matchers, logging, and metrics.
- [Project status](/project/status/): known limitations in this preview.
