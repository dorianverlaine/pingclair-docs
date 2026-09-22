---
title: Serve a static site
h1_emoji: '🗂️'
sidebar:
  order: 2
description: Serve a directory with compression, caching headers, byte ranges, a single-page fallback, and a rule that keeps dotfiles private.
---

Serving files is the other half of what Pingclair does. This page builds a static
site up from `root` and `file_server` to compression, cache headers, range
requests, and the fallback a single-page application needs, and it shows what the
server actually answers at each step.

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

`root *` sets the site root for every request, and `file_server` serves from it.
A path that does not exist answers `404`.

## 🗜️ Compression

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

Arguments are in preference order. The same 36 KB text file, requested with three
different `Accept-Encoding` headers, measured on this configuration:

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli is not implemented for proxied responses, and asking for it is a compile
error rather than a silent downgrade:

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

The message names the alternative, which is the point: a configuration that asks
for something the server cannot honor does not run at all.

## ⏳ Caching headers

`file_server` already answers conditional requests — the `ETag` and
`Last-Modified` above are what a client sends back in `If-None-Match` or
`If-Modified-Since`. How long a client may keep the file is yours to decide, and
it belongs on the paths where it is true:

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

Measured: `Cache-Control: public, max-age=60` on the page,
`public, max-age=31536000, immutable` on `/assets/*`. The immutable value is only
honest when the filenames change with the content, which is why build tools add a
hash to them.

Range requests need no configuration; a client that asks for the first ten bytes
gets them:

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 Single-page applications

An application that routes in the browser needs every unknown path to return its
entry document, while real files keep being served:

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

`file_server browse` renders a listing for a directory that has no index file:

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

The listing names the entries, so `/assets/` shows `big.txt` alongside an
`Index of` heading. Leave `browse` off unless the directory is meant to be read
that way.

## 🔒 Hiding files

⚠️ Dotfiles are served like any other file: `.hidden` answered `200` in the
configuration above, which is how `.git`, `.env`, and editor backups end up on
the internet. To keep them out, answer before the file server runs:

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

Measured: `/.hidden` answers `404` while `/` and `/assets/big.txt` still answer
`200`. `404` rather than `403` is deliberate — a `403` confirms the file exists.

## ⚠️ When it does not work

- **`Unsupported feature: 'encode br'`.** Brotli is refused by name; use
  `encode zstd gzip`.
- **`Unknown directive 'file_server: …'`.** The option does not exist, and
  `validate` names the refused spelling instead of ignoring it.
- **A directory listing instead of the page.** The directory has no `index.html`,
  which is either what you want or a missing file.
- **`404` for a route the application handles.** The single-page fallback is
  missing: `try_files {path} /index.html`.
- **A new page does not appear after a reload.** Reload applies policy, not a new
  listener; files themselves are read per request, so adding a file is immediate
  and moving the listener is not
  ([Run it as a service](/start/service/#-what-a-reload-means)).

## 🧭 Next steps

- [Reverse proxy an application](/guides/reverse-proxy/): the other half of the
  server.
- [`file_server`](/reference/directives/#file_server): the directive reference.
- [`try_files`](/reference/pingclairfile/): how the fallback is compiled.
