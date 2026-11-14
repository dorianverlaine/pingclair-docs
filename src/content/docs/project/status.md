---
title: Project status
h1_emoji: '📌'
description: What the v0.3.0-alpha.1 preview supports, what it refuses by design, which limitations remain, and how to prepare for an upgrade.
---

This page identifies the behavior and known limitations of
**v0.3.0-alpha.1**, the first preview of the 0.3 line. Read it before using the
preview outside a development or staging deployment.

## 📌 The 0.3.0-alpha.1 preview

`v0.3.0-alpha.1` is a prerelease. The latest stable release remains
**v0.2.3**, and `latest` installation and container tags continue to follow
stable releases. The [changelog](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
records the complete changes and upgrade notes.

The preview adds:

- raw TCP routing under a global `layer4` block, with TLS ClientHello SNI and
  ALPN matching, source-IP matching, static and dynamic A/AAAA upstreams, and
  bounded forwarding;
- Layer 4 connection admission, session logs, and `l4_*` metrics;
- mirrored Caddyfile behavior for site-address and HTTPS-port validation;
- `map`, `invoke`, request-scoped access-log fields, and `reverse_proxy` inside
  `handle_errors`; and
- transport fixes for stalled request-body writes, upgraded half-closes, and
  HTTP/3 protocol-error reporting.

## ✅ What the preview supports

| Area | Support |
| --- | --- |
| HTTP | HTTP/1.1, HTTP/2, and HTTP/3 from one configuration. |
| TLS | Public ACME certificates, a persistent internal authority, manual certificate files, and TLS passthrough on Layer 4 listeners. |
| Static files | Compression, ranges, conditional requests, precompressed files, and Markdown negotiation. |
| Reverse proxy | Multiple upstreams, load-balancing policies, health checks, retries, circuit breakers, and bounded overload queues. |
| FastCGI | `php_fastcgi` on HTTP/1.1, HTTP/2, and HTTP/3. |
| Layer 4 | TCP routing by TLS SNI, ALPN, or source address; static and dynamic DNS upstreams; bounded admission and relay; logs and metrics. |
| Observability | Structured access logs, process logs, and Prometheus metrics for HTTP and Layer 4. |
| Administration | Admin API reads, configuration loading, and reload. |
| Configuration | Caddyfile structure, with nginx names for capabilities Caddy does not define. |

## 🛡️ Names the server refuses by design

The Pingclairfile accepts the Caddyfile forms listed in the
[directive reference](/reference/directives/). A recognized name that this
build does not implement is refused during validation, with the missing feature
named in the error. It is not accepted as a no-op.

Important boundaries:

- Caddy modules, plugins, and the native Caddy JSON application schema are not
  available.
- Certificate issuer selection and custom ACME directories remain limited to
  the options listed in the directive reference.
- The current release does not forward HTTP request trailers or provide a
  zero-drop process restart.
- The Layer 4 block is a bounded TCP subset. It is not full caddy-l4 syntax
  compatibility.

## 🔌 Layer 4 boundaries

Layer 4 listeners support TCP only. Current limits include:

- no UDP;
- no TLS termination;
- no PROXY protocol on ingress or toward an upstream;
- no wildcard SNI matcher in `layer4`;
- one listener address per block;
- one static or dynamic upstream per route;
- one `proxy` handler per route; and
- no active health checks or weighted balancing.

HTTP PROXY protocol support and the remaining caddy-l4 proxy syntax are tracked
in [#345](https://github.com/dorianverlaine/pingclair/issues/345) and
[#346](https://github.com/dorianverlaine/pingclair/issues/346).

## ⚠️ Other known limitations

- A response body with a declared length is flushed at completion on HTTP/1.1.
  SSE routes and `flush_interval -1` routes are streamed
  ([#296](https://github.com/dorianverlaine/pingclair/issues/296)).
- An undeclared HTTP/1 request trailer is discarded, which can lose an
  `aws-chunked` checksum ([#257](https://github.com/dorianverlaine/pingclair/issues/257)).
- The response cache does not store or serve HTTP/3 responses
  ([#297](https://github.com/dorianverlaine/pingclair/issues/297)).
- An upstream `103 Early Hints` reaches HTTP/1.1 and HTTP/3 clients. The
  HTTP/2 path still drops it ([#207](https://github.com/dorianverlaine/pingclair/issues/207)).
- A process restart has a listener handoff gap. Reload remains the zero-drop
  path for supported policy changes ([#294](https://github.com/dorianverlaine/pingclair/issues/294)).
- OpenTelemetry tracing remains unshipped pending an overhead measurement
  ([#341](https://github.com/dorianverlaine/pingclair/issues/341)).

<span id="-known-defects-in-023"></span>

## 🔁 Upgrading to the preview

The default installer keeps selecting the latest stable release. Follow
[Upgrading and removing](/start/upgrade/) to install the exact
`v0.3.0-alpha.1` binary or container tag, validate a staged configuration, and
retain a rollback path.

## 🐛 Reporting a defect

Report defects and documentation errors on the
[Pingclair issue tracker](https://github.com/dorianverlaine/pingclair/issues).

## 📚 Related pages

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md):
  release changes and upgrade notes.
- [Layer 4 guide](/guides/layer4/): TCP routing configuration and boundaries.
- [Architecture](/concepts/architecture/): HTTP and Layer 4 execution paths.
