---
title: Architecture
h1_emoji: '🏗️'
description: The crates that make up the server, the path a request takes through them, and where HTTP/1.1, HTTP/2, and HTTP/3 behave differently.
---

Pingclair supports HTTP/1.1, HTTP/2, and HTTP/3. Each transport handles protocol
I/O, while a shared policy layer applies routing, header rules, rate limits,
and access logging. This page describes the components, the request path, and
protocol differences in **v0.3.0-alpha.1**.

## 🧱 The server is one binary built from a few crates

Pingclair is a Cargo workspace. The `pingclair` binary links the crates below;
each one owns a single responsibility.

| Crate | Responsibility |
| --- | --- |
| `pingclair` | Command-line entry point: argument parsing, logging, startup, shutdown, and reload. |
| `pingclair-config` | Configuration compiler: reads the Pingclairfile, checks it, and produces the configuration the server runs. |
| `pingclair-proxy` | HTTP/1.1 and HTTP/2 on Pingora, HTTP/3 on quiche, load balancing, and the shared request policy layer. |
| `pingclair-l4` | Raw TCP classification, bounded preread, static and dynamic upstream selection, relay, and Layer 4 session policy. |
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

The transport adapter converts protocol frames into a request and passes it
to the shared policy layer. That layer applies routing, header rules, rate
limiting, and access logging across HTTP/1.1, HTTP/2, and HTTP/3. Both
transports also reach upstreams through the same connector, so connection
pooling, upstream TLS, and timeouts are shared as well.

## 🔌 Raw TCP connections use a separate path

Layer 4 listeners do not create an HTTP request. They classify a bounded
ClientHello when TLS metadata is required, choose one route, connect to that
route's upstream, replay the preread bytes, and relay both directions:

```text
client
  |
  |  raw TCP
  v
Layer 4 listener       bounded admission and source-IP policy
  |
  v
classifier             TLS presence, SNI, ALPN, or source address
  |
  v
route                  first matching static or dynamic upstream
  |
  v
relay                  bounded buffers and optional half-close
  |
  v
upstream
```

TLS remains end to end. HTTP redirect and reverse-proxy policy do not apply to
this path. The [Layer 4 guide](/guides/layer4/) describes configuration,
dynamic DNS, limits, logging, and metrics.

## 🌊 What holds for every request

- **Bodies use bounded memory.** Proxy bodies stream by default. Explicit
  request or response buffering delays forwarding up to its configured ceiling,
  then streams the remainder; `unlimited` still caps memory at 8 MiB.
  Static live compression is bounded as well. See the [known streaming defects](/project/status/).
- **Upstream connections are reused.** Keepalive connections to backends are
  pooled. A hostname upstream is resolved again on the interval set by
  `dns_refresh`, so a backend container that restarts on a new address is
  resolved automatically.
- **Configuration is read, never changed, while requests run.** Each request
  reads a published snapshot of the compiled configuration. A reload builds a
  new snapshot and swaps it in; requests already running finish on the old one.

## 🌐 Where the protocols differ

A few behaviors differ by protocol. They are listed here so that operators can
account for them before deployment.

| Area | Behavior in v0.3.0-alpha.1 |
| --- | --- |
| Trailers | Request trailers are not forwarded on any protocol. A request that declares them is answered `501` before the response starts; an HTTP/3 stream whose response has already started is reset instead. An upstream response that advertises trailers keeps its status and body; the trailer fields are dropped. |
| `CONNECT` | A usable `host:port` target receives `405` with `Allow`; a target without a usable port receives `400`. HTTP/1.1 closes after refusal. |
| FastCGI | `php_fastcgi` works on every protocol, HTTP/3 included. |

📌 `TRACE` also receives `405` with `Allow`. Malformed HTTP/1 chunked bodies, raw whitespace or controls in request targets, and HTTP/1.1 requests without Host receive `400` and close.

## 🧭 Related pages

- [Configuration model](/concepts/configuration/): how a Pingclairfile becomes
  the snapshot described above.
- [Project status](/project/status/): what the release supports and refuses.

📌 See [Project status](/project/status/) for the remaining streaming and protocol defects. Cancelling an HTTP/3 request releases an idle upstream exchange while other streams on the connection remain usable.
