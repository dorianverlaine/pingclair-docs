---
title: Admin API
h1_emoji: '🩺'
description: The Admin API endpoints, how requests are authenticated, how configuration reads and writes behave, and the metric names it exports.
---

The Admin API is an HTTP endpoint on the server process for reading and
replacing the running configuration, checking readiness, and scraping metrics.
`pingclair reload` and `pingclair stop` use it. This page describes
**v0.2.0**.

## 🔌 Turning it on

The API exists only when the global `admin` option is present, or when
`pingclair run` starts without any configuration file. The default address is
`127.0.0.1:2019`.

```caddyfile
{
    admin 127.0.0.1:2019
}

http://:8080 {
    respond "ok"
}
```

A taken admin port stops startup with `failed to bind admin API on ADDR`.
`admin off` binds nothing.

## 🔐 Who may call it

- **With a token**, written as `admin <address> <token>`, every request must
  send `Authorization: Bearer <token>`. A missing or wrong token gets `401` with
  `WWW-Authenticate: Bearer`.
- **Without a token**, the server logs a warning and admits loopback clients
  only. Any other client gets `403`.
- **`origins` and `enforce_origin`** in an `admin { … }` block restrict which
  browser origins may call the API. A request without an `Origin` header is
  admitted unless `enforce_origin` is set.

Every endpoint below, `/live` and `/ready` included, is behind these checks.

## 🧭 Endpoints

| Method and path | What it does |
| --- | --- |
| `GET /live` | `200` while the process runs, draining included. |
| `GET /ready` | `200` once every listener is bound; `503` before that and from the moment a stop begins. |
| `GET /metrics` | Prometheus text exposition. Empty when metrics collection is off. |
| `GET /config/[path]` | Read the running configuration, or one value inside it. |
| `POST`, `PUT`, `PATCH`, `DELETE /config/[path]` | Change one value and apply the result. |
| `GET` … `DELETE /id/<id>` | The same, addressed by an `@id` field in the document. |
| `POST /load` | Replace the whole configuration. |
| `POST /adapt` | Convert a Pingclairfile to the JSON document, without applying it. |
| `POST /stop` | Stop the process gracefully. |
| `GET /reverse_proxy/upstreams` | The upstream addresses the configuration names, including those inside `handle` blocks. |
| `GET /cache` | Response-cache size against its ceiling. |
| `POST /cache/purge` | Drop one cached URL. The body is `{"host": "…", "path": "…"}`. |

The configuration document is Pingclair's own JSON schema, the one
`pingclair adapt` prints. A Caddy document (`{"apps": …}`) is refused with a
message that names the schema this endpoint takes.

## 📄 Reading and writing configuration

- **A missing path reads as `null`.** `GET /config/<path>` for a key or index
  that does not exist answers `200` with the JSON value `null`. Writes to a
  missing path still fail, and the error names the nearest parent.
- **Reads carry a path-qualified `Etag`.** A config write that sends `If-Match` with the value read from the same path is
  applied only if the document has not changed since; otherwise it gets `412`
  and the running document stays unchanged. A write without `If-Match` is
  unconditional. This does not extend conditional writes to `/load` or `/adapt`.
- **Secrets are masked.** Reads show `[redacted]` in place of the admin token,
  DNS provider credentials, basic-auth hashes, FastCGI `env` entries with
  credential-like names, and header values named `Authorization`,
  `Proxy-Authorization`, `Cookie`, `Set-Cookie`, or containing `api-key`,
  `token`, `secret`, or `password`. The stored configuration keeps the real
  values, and a traversal write (`PATCH /config/…`) edits them in place.
- **A document carrying `[redacted]` as a secret is refused** by `/load` and
  `POST /config`. Put the real values back before loading an exported
  document.
- **Reads keep working during a reload.** Each request is answered from one
  published generation of the document. A write that races another reload may
  get `409`, or `412` for a conditional write; read again and retry.

## 🔁 What a load can change

A load swaps the configuration atomically: a request sees either the old one or
the new one, and a configuration that fails to compile leaves the old one
serving. Changes that need new sockets or a new process-wide policy are refused
with `409` and `restart_required`, and nothing is applied:

- adding or removing a listen address;
- adding a TLS hostname;
- changing a startup-fixed global policy, `metrics` and `trusted_proxies` included;
- enabling mutual TLS on a listener that allows session resumption.

A process started without a configuration file is the exception: on Unix, its
first `/load` may add plaintext HTTP listeners. TLS and HTTP/3 listeners need a
file at startup. Reloadable process-log settings are not subject to those startup-policy restrictions.

## 📊 Metrics

Nothing is collected unless the global `metrics` option is set; without it,
`/metrics` and a site's `metrics` route answer `200` with an empty body.
`metrics { per_host }` adds a `host` label for the hosts the configuration
serves, and folds every other `Host` into `other`.

The standard request families use Caddy's names. The families renamed in 0.2.0:

| Before 0.2.0 | From 0.2.0 |
| --- | --- |
| `pingclair_requests_total` | `caddy_http_requests_total` |
| `pingclair_request_duration_seconds` | `caddy_http_request_duration_seconds` |
| `pingclair_request_size_bytes` | `caddy_http_request_size_bytes` |
| `pingclair_response_size_bytes` | `caddy_http_response_size_bytes` |
| `pingclair_response_duration_seconds` | `caddy_http_response_duration_seconds` |
| `pingclair_request_errors_total` | `caddy_http_request_errors_total` |
| `pingclair_admin_http_requests_total` | `caddy_admin_http_requests_total` |
| `pingclair_reverse_proxy_upstreams_healthy` | `caddy_reverse_proxy_upstreams_healthy` |

Histogram `_bucket`, `_sum`, and `_count` series follow their family. The old
names are no longer exported. Metrics without a Caddy equivalent keep their
`pingclair_` names: connections, overload, cache, access-log drops, upstream
timing, errors and retries, TLS and HTTP/3 counters, readiness, configuration
version, queue occupancy, circuit state, and process resources. The labels are
Pingclair's; the names do not imply Caddy's full label schema.

## 🧭 Related pages

- [Command line](/reference/command-line/): `reload` and `stop`, which call this
  API.
- [Configuration model](/concepts/configuration/#-a-reload-swaps-the-configuration-without-a-restart):
  what a reload can and cannot apply.
- [Directives: global options](/reference/directives/#global-options): `admin`
  and `metrics`.

📚 The [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) records these changes and their upgrade consequences.
