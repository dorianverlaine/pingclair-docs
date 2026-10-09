---
title: Serve a static site
h1_emoji: '🗂️'
sidebar:
  order: 2
description: Serve a directory with compression, caching headers, byte ranges, a single-page fallback, and a rule that keeps dotfiles private.
---

This page explains how to serve a directory with `root` and `file_server`,
configure compression and cache headers, and support range requests and
single-page applications.

📌 This page describes **v0.2.2**.

## 🧾 Before you start

- Pingclair installed and running ([Install](/start/install/)), service stopped
  while you experiment: `sudo pc service stop`.
- A directory to serve. The examples use `/srv/site`.

## 📁 Serve a directory

```caddyfile
http://:8080 {
    root * /srv/site
    file_server
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo systemctl restart pingclair
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Last-Modified: Tue, 22 Sep 2026 04:37:54 GMT
ETag: "5e-6ab20622"
Accept-Ranges: bytes
```

`root *` sets the site root for every request, and `file_server` serves files
from it. A path that does not exist answers `404`.

## 🗜️ Compression

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

`encode` lists formats in preference order. The same 36 KB text file, requested
with three different `Accept-Encoding` headers:

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli is not implemented for proxied responses. Configuring it produces a
compilation error:

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

The error identifies the supported alternatives. Unsupported options prevent
the configuration from loading.

A site compresses responses only when `encode` is configured. Gzip defaults to level 5; a block can select levels 1–9 and a `minimum_length` (512 bytes by default). Static responses always carry `Vary: Accept-Encoding`. Each coding has its own ETag, and gzip tags include the level. Precompressed sidecars use their own size and modification time for validators and take precedence over cached live compression.

## ⏳ Caching headers

`file_server` evaluates `If-Match`, `If-Unmodified-Since`, `If-None-Match`, and `If-Modified-Since` in that order, returning `304` or `412`. A failed `If-Range` returns the whole file with `200`. A configured `ETag` header is the representation's validator: preconditions compare against the tag the site's own header policy puts on the response, as RFC 9110 §13.1.2 asks. Ranges stream in bounded chunks with identity encoding. Canonical redirects preserve the query string and clean the path.

Set `Cache-Control` for the paths to which each cache lifetime applies:

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    header Cache-Control "public, max-age=60"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    file_server
}
```

Measured: `Cache-Control: public, max-age=60` on the page, and
`public, max-age=31536000, immutable` on `/assets/*`. `immutable` is safe only
when a file's name changes whenever its content does, which is why build tools
add a content hash to asset names.

Range requests require no additional configuration. For example, request the
first ten bytes of a file:

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 Single-page applications

An application that routes in the browser needs every unknown path to return
its entry document, while real files are still served as themselves:

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

Measured: `/assets/big.txt` still answers `200` with its own content, and
`/some/spa/route` answers `200` with `index.html`. Without the `try_files` line,
the second request is a `404`.

## 🗂️ Directory listings

`file_server browse` shows a listing for a directory that has no index file:

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

The listing names the entries: `/assets/` shows `big.txt` under an `Index of`
heading. Enable `browse` only for directories intended to have public listings.

## 🔒 Hiding files

⚠️ Dotfiles are served like any other file: `.hidden` answered `200` in the
configuration above. This can expose `.git`, `.env`, and editor backups. Deny requests for
these paths before the file-server handler runs:

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

Measured: `/.hidden` answers `404`, while `/` and `/assets/big.txt` still
answer `200`. The status is intentionally `404` rather than `403`: a `403`
confirms that the file exists. `/.*` matches only dotfiles at the top of the
site; the `file_server { hide … }` option hides paths wherever they are.

<span id="️-when-it-does-not-work"></span>

## ⚠️ Troubleshooting

- **`Unsupported feature: 'encode br'`.** Brotli is refused by name; use
  `encode zstd gzip`.
- **`Unknown directive 'file_server: …'`.** The option does not exist, and
  `validate` names the refused spelling instead of ignoring it.
- **A directory listing instead of the page.** The directory has no `index.html`.
  Add an index file if a listing is not intended.
- **`404` for a route the application handles.** The single-page fallback is
  missing: `try_files {path} /index.html`.
- **A change does not appear after a reload.** Files are read per request, so
  a new file appears at once without a reload. A new or moved listener needs a
  restart ([Run it as a service](/start/service/#-what-a-reload-means)).

## 🧭 Next steps

- [Reverse proxy an application](/guides/reverse-proxy/): serve requests through an
  application upstream.
- [`file_server`](/reference/directives/#file_server): the directive reference.
- [Pingclairfile](/reference/pingclairfile/): matchers and route order.
