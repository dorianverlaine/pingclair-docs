---
title: Project status
h1_emoji: '📌'
description: What the current release supports, what it refuses by design, which limitations and defects are known, and how to prepare for an upgrade.
---

This page explains whether the current release meets a deployment's
requirements and identifies its current limitations. It describes
**v0.2.0**.

## 📌 The 0.2.0 release

The current release is **v0.2.0**. Its
[release notes](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
list what changed and the defects known when it was tagged.

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

The Caddyfile format defines more names than Pingclair implements. A name the
server cannot honor is refused when the file is loaded, with a message that
names the missing feature. A configuration that contains one does not start.

The following complete lists are derived from the registries in 0.2.0. They
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

## ⚠️ Known limitations

Certificate storage is local; a shared storage backend, layer-4 proxying,
plugins, and Caddy's native JSON schema are not supported. DNS-01 works with
Cloudflare in 0.2.0. `CONNECT` and `TRACE` are refused with `405` and `Allow`;
malformed CONNECT authorities receive `400`. Declared request trailers are
not forwarded, and an upstream response that announces `Trailer` receives `502`.

## 🐛 Known defects in 0.2.0

The [CHANGELOG's known-defect sections](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#-known-defect--websocket-upgrades-under-load)
record these release limitations. Configuration validation does not detect them.

- **WebSocket upgrades under load:** roughly 10–15% fail on a busy machine,
  with EOF immediately after `101`. No configuration avoids the race.
- **HTTP/1.1 responses with Content-Length:** the response is held until its
  body ends. Use chunked framing for event streams; H2 and H3 are unaffected.
- **Proxy gzip:** unannounced trailers from an HTTP/2 upstream may end the
  compressed body early.
- **Announced upstream trailers:** the proxy returns `502`.
- **HTTP/1.0 proxy responses:** an upstream with no length may produce chunked
  framing for the client.
- **Upgrade half-close:** a client half-close ends the tunnel and loses any
  backend bytes still pending.
- **Failure before the first upstream body byte:** an H2 client may receive a
  reset instead of `502`.
- **Passive health checks:** a backend that truncates every response stays in
  rotation; `max_fails` and `fail_duration` are not implemented.
- **Configured ETag:** the advertised header is not used for revalidation.
- **Repeated path separators:** `/a//b` is collapsed before forwarding.
- **FastCGI:** `php_fastcgi` answers `411` to chunked or bodyless requests.
- **HTTP/3 transport parameters:** 18 of 77 h3spec checks fail.
- **Manual wildcard certificates:** a wildcard site's manual certificate is
  not served for covered names over TCP; `tls internal` is unaffected.

## 🔁 Upgrading to 0.2.0

[Upgrading](/start/upgrade/) summarizes the changes most likely to affect
0.1.x and release-candidate configurations. The
[Before you upgrade list](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)
is the complete release checklist.

## 🐛 Reporting a defect

Report defects and documentation errors on the
[Pingclair issue tracker](https://github.com/dorianverlaine/pingclair/issues).

## 📚 Related pages

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md): release changes and known defects.
- [Benchmarks](/project/benchmarks/): historical measurement conditions.
- [Architecture](/concepts/architecture/): components and request handling.
