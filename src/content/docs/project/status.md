---
title: Project status
h1_emoji: '📌'
description: What the current release supports, what it refuses by design, which limitations and defects are known, and what changes in the next release.
---

This page explains whether the current release meets a deployment's
requirements and identifies its current limitations. It describes
**v0.2.0-rc.3**, the latest published release.

## 📌 The current release is a release candidate

The current release is **v0.2.0-rc.3**. Its
[release notes](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)
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

The following complete lists are derived from the registries on `main`. They
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
  implemented on `main`; older documentation that lists them as unsupported is
  obsolete.

## ⚠️ Known limitations

- **Certificate storage is local.** Several instances cannot share one
  certificate store, because the store is a directory on disk.
- **DNS-01 does not complete in this release.** `tls { dns cloudflare <token> }`
  and the global `acme_dns` option are accepted for Cloudflare, and any other
  provider is refused by name. In v0.2.0-rc.3, however, every DNS-01 order ends
  `Invalid`, because the TXT record carries the wrong value. The fix is on
  `main` ([HTTPS](/start/https/#-dns-01-and-wildcards)).
- **No protocol forwards trailers, and none opens tunnels.** Declared request
  trailers are refused on every protocol, and HTTP/3 resets `CONNECT`
  ([Architecture](/concepts/architecture/#-where-the-protocols-differ)).
- **WebSocket upgrades fail intermittently under load**, roughly 10-15% on a
  busy machine. The cause is a race in the upstream `pingora-proxy` crate
  ([cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)),
  and an idle machine rarely reproduces it.

## 🔁 What changes in the next release

The changes below are on `main` and are not in v0.2.0-rc.3. Several change
behavior on upgrade; the
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
lists every one under Unreleased, with upgrade notes.

- **Route order follows Caddy.** The directive order, not the most specific
  path, decides which route answers
  ([Configuration model](/concepts/configuration/#-which-route-answers-a-request)).
- **Compression happens only where `encode` asks.** A site without `encode`
  serves files uncompressed.
- **No default request-body limit.** The 1 MiB default is gone; set
  `request_body { max_size … }` if you relied on it.
- **`remote_ip` and `client_ip` differ.** `remote_ip` matches the connection's
  peer, and `client_ip` matches the client after `trusted_proxies`. To block
  clients in a Pingclairfile, match `client_ip` and `abort`; `blocked_ips`
  exists only in JSON configuration.
- **`CONNECT` and `TRACE` get `405`** with an `Allow` header on every protocol.
- **HSTS follows the connection.** `Strict-Transport-Security` is sent only on
  encrypted responses, and a Pingclairfile turns it on with
  `header Strict-Transport-Security "max-age=…"`.
- **A stop is graceful.** `SIGTERM` lets running requests finish within
  `grace_period` (30 seconds by default).
- **A taken admin or HTTP/3 port stops startup** instead of being logged.
- **Gateway errors say who wrote them.** A `502` or `504` that Pingclair
  generated carries a `Proxy-Status` header.
- **DNS-01 works**, and a wildcard site orders one wildcard certificate.
- **`storage file_system <path>` and `ocsp_stapling off` are accepted.**
- **The internal authority moves** to Caddy's layout. The old one is not
  migrated: a new root is created, and clients must trust it again.

## 🐛 Reporting a defect

Report defects and documentation errors on the
[issue tracker](https://github.com/dorianverlaine/pingclair/issues). A security
policy with a private reporting channel has not been published yet.

## 📚 Related pages

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md):
  what changed between releases.
- [Benchmarks](/project/benchmarks/): measurement conditions and results.
- [Architecture](/concepts/architecture/): components and request path.
