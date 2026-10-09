---
title: Project status
h1_emoji: '📌'
description: What the current release supports, what it refuses by design, which limitations and defects are known, and how to prepare for an upgrade.
---

This page explains whether the current release meets a deployment's
requirements and identifies its current limitations. It describes
**v0.2.2**.

## 📌 The 0.2.2 release

The current release is **v0.2.2**, the newest patch on the 0.2 line. The
[changelog](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
records what each release changed and the defects known when it was tagged.
0.2.1 and 0.2.2 need no configuration change: a `handle_path` beside a bare
`handle` now answers the requests it matches, a listener can allowlist
underscore-named request fields, and a newly declared access-log channel
receives records after a reload. The 0.3 development line lives on `main` and
is not part of this release.

The `v0.1.x` line is unmaintained. It receives no fixes, no backports, and no
security advisories. Upgrade from it: `v0.1.x` parsed the Admin API `api_key`
field but did not enforce it, so the Admin API did not authenticate requests.

## ✅ What the release supports

| Area | Support |
| --- | --- |
| Protocols | HTTP/1.1 and HTTP/2 on TCP, and HTTP/3 over QUIC, from one configuration. |
| TLS | Automatic public certificates over ACME, a persistent internal certificate authority, and certificate files you supply. |
| Static files | File serving with `zstd` and `gzip` compression, range requests, and conditional requests. |
| Reverse proxy | Multiple upstreams, several load-balancing policies, active health checks, and backup upstreams. |
| FastCGI | `php_fastcgi` on HTTP/1.1, HTTP/2 and HTTP/3. |
| Rate limiting | Exact local rate limiting per matcher. |
| Observability | Access logging with rotation, and Prometheus metrics. |
| Administration | Admin API for inspecting state and reloading configuration. |

## 🛡️ Names the server refuses by design

The Caddyfile format defines more names than Pingclair implements. An unsupported
name is rejected when the file is loaded, with a message that
names the missing feature. A configuration that contains one does not start.

The following complete lists are derived from the registries in 0.2.2. They
describe names Pingclair recognizes as Caddy syntax but does not implement in
that context.

**Directives:**

`copy_response`, `copy_response_headers`, `fs`, `invoke`, `log_append`,
`log_name`, `map`, `push`, `skip_log`, `tracing`.

`copy_response` and `copy_response_headers` work as `handle_response`
subdirectives; they are refused only when written as standalone directives.

**Global options:**

`acme_ca`, `acme_ca_root`, `acme_eab`, `cert_issuer`, `cert_lifetime`, `ech`,
`events`, `fallback_sni`, `filesystem`, `frankenphp`, `key_type`,
`ocsp_interval`, `on_demand_tls`, `preferred_chains`, `renew_interval`,
`shutdown_delay`, `storage_clean_interval`.

**Options inside `tls { … }`:**

`protocols`, `ciphers`, `curves`, `alpn`, `load`, `ca`, `ca_root`, `key_type`,
`eab`, `issuer`, `get_certificate`, `on_demand`, `reuse_private_keys`,
`insecure_secrets_log`, `force_automate`.

### 🧭 Important compatibility differences

- A supported name is not necessarily accepted in every Caddy context. For
  example, `copy_response` belongs inside `handle_response`.
- DNS-01 supports Cloudflare. Other provider names are refused instead of
  falling back to a different challenge.
- `encode br` is refused because proxied responses do not have a streaming
  Brotli implementation. Use `zstd` or `gzip`.
- `storage file_system <path>`, `ocsp_stapling off`, and `handle_errors` are
  implemented in 0.2.0; older documentation that lists them as unsupported is
  obsolete.
- A request field whose name contains an underscore is dropped, as Caddy drops
  it, unless `servers { expected_underscore_headers … }` lists the name or a
  prefix that ends in `*`. This option landed in 0.2.2; before it, the field
  was dropped on every transport and could not be allowed back.

## ⚠️ Known limitations

Certificate storage is local; a shared storage backend, plugins, and Caddy's
native JSON schema are not supported, and layer-4 proxying belongs to the 0.3
development line. DNS-01 supports Cloudflare; other provider names are refused
rather than falling back to a different challenge. `CONNECT` and `TRACE` are
refused with `405` and `Allow`; malformed CONNECT authorities receive `400`.
Declared request trailers are not forwarded; an upstream response that
announces `Trailer` keeps its status and body, with the trailer fields dropped.

## 🐛 Known defects in 0.2.2

The [changelog's known-defect sections](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#-known-defect--websocket-upgrades-under-load)
record these release limitations, and each carries an open issue.
Configuration validation does not detect them.

- **WebSocket upgrades under load:** roughly 10–15% fail on a busy machine,
  with EOF immediately after `101`. No configuration avoids the race; the
  fault is in `pingora-proxy` (cloudflare/pingora#946).
- **HTTP/1.1 responses with Content-Length:** a proxied body whose origin
  declared a length is flushed only when the body ends. Responses that carry
  an immediacy signal — `text/event-stream`, or a route with
  `flush_interval -1` — are already streamed; HTTP/2 and HTTP/3 are unaffected
  (#296).
- **Undeclared request trailers:** on HTTP/1, a trailer section sent without a
  `Trailer` declaration is discarded, so an `aws-chunked` upload's checksum
  never reaches the origin while the request is answered normally (#257).
- **Upgrade half-close:** a client half-close ends the tunnel and loses any
  backend bytes still pending (#274).
- **The response cache over HTTP/3:** a route with a `cache` block answers from
  the store over HTTP/1.1 and HTTP/2, and reaches the origin over HTTP/3
  (#297).
- **`103 Early Hints`:** an upstream's interim response reaches HTTP/1.1
  clients only; the HTTP/2 and HTTP/3 paths drop it (#207).
- **HTTP/3 transport parameters:** 18 of 77 h3spec checks fail; the fix belongs
  in the QUIC library (#282).

## 🔁 Upgrading to 0.2.2

[Upgrading](/start/upgrade/) summarizes the changes most likely to affect
0.1.x and release-candidate configurations. The
[Before you upgrade list](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)
is the complete release checklist.

## 🐛 Reporting a defect

Report defects and documentation errors on the
[Pingclair issue tracker](https://github.com/dorianverlaine/pingclair/issues).

## 📚 Related pages

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md): release changes and known defects.
- [Benchmarks](/project/benchmarks/): measurement conditions and results.
- [Architecture](/concepts/architecture/): components and request handling.
