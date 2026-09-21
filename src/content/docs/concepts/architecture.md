---
title: Architecture
description: The components of the server and the path a request takes through them.
---

## 🧱 Components

Pingclair is a Cargo workspace. The running server is the `pingclair` binary,
which links the crates below.

| Crate | Responsibility |
| --- | --- |
| `pingclair` | Command-line entry point: argument parsing, logging, startup, and the service wrapper. |
| `pingclair-config` | Configuration compiler: lexes, parses, and semantically checks the Pingclairfile. |
| `pingclair-proxy` | HTTP/1.1 and HTTP/2 proxying on Pingora, the HTTP/3 listener on quiche, load balancing, and the shared request policy layer. |
| `pingclair-static` | Static file serving: file reads, MIME types, range requests, and streaming. |
| `pingclair-tls` | Certificate management: manual certificates, a persistent internal certificate authority, and automatic ACME issuance. |
| `pingclair-api` | Admin API for inspecting state and reloading configuration. |
| `pingclair-core` | Data structures and server lifecycle shared by the crates above. |

## 🚦 The path of a request

```text
client
  |
  |  TLS with ALPN, or QUIC
  v
listener             HTTP/1.1 and HTTP/2 on TCP, HTTP/3 on UDP
  |
  v
transport adapter    Pingora ProxyHttp for TCP, tokio-quiche for QUIC
  |
  v
policy layer         routing, matchers, headers, rate limits, access log
  |
  v
handler              file server | reverse proxy | FastCGI | static response
  |
  v
upstream or disk
```

Both transports converge on the same policy layer, so routing, header
handling, rate limiting, and access logging behave the same on HTTP/1.1,
HTTP/2, and HTTP/3. The transports differ only where the protocol requires it,
and those differences are listed below.

## 🌊 Request handling properties

- **Bodies are streamed.** Request and response bodies move through the proxy in
  bounded chunks. Compression, middleware, and proxying do not buffer a
  complete body, so a large upload or a slow reader does not consume memory
  proportional to the body size.
- **Upstream connections are pooled.** Keepalive connections to backends are
  reused. Hostname upstreams are re-resolved on the interval set by
  `dns_refresh`, so a container that restarts on a new address is followed
  without an operator action.
- **Runtime state is immutable at request time.** Requests read a published
  snapshot. A reload publishes a new snapshot instead of mutating the one in
  use.

## 🌐 Protocol-specific behavior

Some behavior differs by protocol by design. It is listed here rather than
discovered later:

| Area | Behavior |
| --- | --- |
| Trailers | Declared request trailers are not forwarded. The server answers `501` before the response is committed, resets an already committed HTTP/3 stream, and answers `502` when an upstream advertises response trailers. |
| CONNECT | `CONNECT` and extended `CONNECT` return `501` on HTTP/3 until tunnel support is implemented. |
| FastCGI | `php_fastcgi` works on HTTP/1.1 and HTTP/2. Routes that need FastCGI return `501` on HTTP/3 until that path has its own FastCGI client. |

## ⚠️ Known defect

WebSocket upgrades fail intermittently under load: roughly 10-15% of upgrades on
a busy machine. The cause is a race in the upstream `pingora-proxy` crate rather
than in Pingclair's own upgrade handling, and it is invisible on an idle
developer machine, which is why it is documented here. Upstream issue:
[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946).
