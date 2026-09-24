---
title: Architecture
h1_emoji: '🏗️'
description: The crates that make up the server, the path a request takes through them, and where HTTP/1.1, HTTP/2, and HTTP/3 behave differently.
---

A web server that speaks three HTTP versions has two ways to go wrong: each
protocol grows its own copy of the rules, or one protocol quietly misses a rule
the others follow. Pingclair avoids both by giving each transport only the job
of moving bytes, and sending every request through one shared policy layer.
This page describes the components, the path a request takes, and the few
places where the protocols still differ. It describes **v0.2.0-rc.3**.

## 🧱 The server is one binary built from a few crates

Pingclair is a Cargo workspace. The `pingclair` binary links the crates below;
each one owns a single responsibility.

| Crate | Responsibility |
| --- | --- |
| `pingclair` | Command-line entry point: argument parsing, logging, startup, shutdown, and reload. |
| `pingclair-config` | Configuration compiler: reads the Pingclairfile, checks it, and produces the configuration the server runs. |
| `pingclair-proxy` | HTTP/1.1 and HTTP/2 on Pingora, HTTP/3 on quiche, load balancing, and the shared request policy layer. |
| `pingclair-static` | Static file serving: file reads, MIME types, range and conditional requests, and streaming. |
| `pingclair-fastcgi` | The FastCGI client that `php_fastcgi` uses to reach PHP-FPM. |
| `pingclair-tls` | Certificate management: certificate files, the internal certificate authority, and ACME issuance. |
| `pingclair-api` | Admin API for inspecting state and reloading configuration. |
| `pingclair-core` | Data structures and lifecycle shared by the crates above. |

## 🚦 Every request crosses the same policy layer

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

The transport adapter turns protocol frames into a request and hands it on.
Routing, header rules, rate limiting, and access logging live once, in the
policy layer, so they behave the same on HTTP/1.1, HTTP/2, and HTTP/3. Both
transports also reach upstreams through the same connector, so connection
pooling, upstream TLS, and timeouts are shared as well.

## 🌊 What holds for every request

- **Bodies are streamed.** Request and response bodies move through the server
  in bounded chunks. Compression and proxying do not collect a complete body
  first, so a large upload or a slow reader does not cost memory in proportion
  to the body size.
- **Upstream connections are reused.** Keepalive connections to backends are
  pooled. A hostname upstream is resolved again on the interval set by
  `dns_refresh`, so a backend container that restarts on a new address is
  followed without operator action.
- **Configuration is read, never changed, while requests run.** Each request
  reads a published snapshot of the compiled configuration. A reload builds a
  new snapshot and swaps it in; requests already running finish on the old one.

## 🌐 Where the protocols differ

A few behaviors differ by protocol. They are listed here so that nobody has to
discover them in production.

| Area | Behavior in v0.2.0-rc.3 |
| --- | --- |
| Trailers | Request trailers are not forwarded on any protocol. A request that declares them is answered `501` before the response starts; an HTTP/3 stream whose response has already started is reset instead. An upstream response that advertises trailers is answered `502`. |
| `CONNECT` | Pingclair opens no tunnels. HTTP/1.1 and HTTP/2 answer `405`. HTTP/3 resets a standard `CONNECT` request as malformed, and answers `501` to one that also carries `:scheme` and `:path`. |
| FastCGI | `php_fastcgi` works on HTTP/1.1 and HTTP/2. On HTTP/3, a route that needs FastCGI is answered `501`. |

📌 **Next release.** On `main`, `CONNECT` is answered `405` with an `Allow` header
on every protocol, and `TRACE` is answered the same way. These changes are not
in v0.2.0-rc.3; the
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
records them under Unreleased.

## ⚠️ WebSocket upgrades fail intermittently under load

Pingclair proxies WebSocket, but roughly 10-15% of upgrades fail when the
machine is busy. From the outside, a failed upgrade is a connection closed
immediately after the `101 Switching Protocols` response. The cause is a race
in the upstream `pingora-proxy` crate, not in Pingclair's upgrade handling, and
no configuration avoids it. An idle developer machine rarely reproduces it,
which is why it is stated here. Upstream issue:
[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946).

## 🧭 Related pages

- [Configuration model](/concepts/configuration/): how a Pingclairfile becomes
  the snapshot described above.
- [Project status](/project/status/): what the release supports and refuses.
