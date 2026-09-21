---
title: Project status
h1_emoji: '📌'
description: What the current release supports, what it refuses, and which defects are known.
---

## 📌 Release

The current release is **v0.2.0-rc.3**, a release candidate. Its
[release notes](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)
list what changed and the defects known at tagging time.

The `v0.1.x` line is unmaintained. It receives no fixes, no backports, and no
security advisories; `v0.1.x` also parsed the Admin API `api_key` field without
reading it, so the field protected nothing.

## ✅ Supported

| Area | Status |
| --- | --- |
| Protocols | HTTP/1.1 and HTTP/2 on TCP, HTTP/3 over QUIC, from one configuration. |
| TLS | Automatic public certificates over ACME, a persistent internal certificate authority, and manual certificate and key files. |
| Static files | File serving with `zstd` and `gzip` compression, range requests, and conditional requests. |
| Reverse proxy | Multiple upstreams, several load-balancing policies, active health checks, and backup upstreams. |
| FastCGI | `php_fastcgi` on HTTP/1.1 and HTTP/2. |
| Rate limiting | Exact local rate limiting per matcher. |
| Observability | Access logging with rotation, and Prometheus metrics. |
| Administration | Admin API for inspecting state and reloading configuration. |

## 🛡️ Refused by design

The configuration format defines more names than the server implements. A name
that the server cannot honor is refused at load time, by name, with a message
saying the feature is missing. Examples that readers ask about most often:

- `map`, `invoke`, and `tracing` directives;
- the `storage` option, because certificates and state are stored on local disk
  only;
- `on_demand_tls` and OCSP stapling options;
- `handle_errors`, where the configuration type exists but performs no work;
- `encode br`, because no streaming Brotli encoder exists.

The complete lists are maintained in the server repository's README, which is
checked by a test that fails when the parser refuses a name the list does not
mention.

## ⚠️ Known limitations

- **Certificate storage is local.** Several instances cannot share one
  certificate store, because the store is a directory on disk.
- **DNS-01 has one provider.** `tls { dns cloudflare <token> }` and the global
  `acme_dns` option are implemented for Cloudflare. Any other provider name is
  refused at startup rather than accepted and ignored.
- **HTTP/3 trailers and tunnels.** Declared request trailers are not forwarded
  (`501` before the response commits, stream reset afterwards), upstream
  trailers produce `502`, and `CONNECT` returns `501`.
- **FastCGI on HTTP/3 returns `501`** until that path has its own FastCGI
  client.
- **WebSocket upgrades fail intermittently under load**, roughly 10-15% on a
  busy machine. The cause is a race in the upstream `pingora-proxy` crate
  ([cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)),
  not in Pingclair's own handling, and an idle machine will not reproduce it.

## 🐛 Reporting

Defects and documentation errors are reported through the
[issue tracker](https://github.com/dorianverlaine/pingclair/issues). A security
policy naming a private reporting channel has not been published yet.

## 📚 Related documents

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md):
  what changed between releases.
- [Benchmarks](/project/benchmarks/): measurement conditions and results.
- [Architecture](/concepts/architecture/): components and request path.
