---
title: Serve HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: Turn HTTP/3 on, prove that a client really used it, and know which requests behave differently over QUIC.
---

HTTP/3 is on by default: an HTTPS site gets a QUIC listener on UDP 443 unless
the global protocol list leaves `h3` out. The part that needs care is proving a
client really used it, because a client that silently falls back to HTTP/2 looks
exactly like success.

📌 This page describes **v0.2.0-rc.3**, the latest published release. Changes
that exist only on the server's `main` branch are marked **Next release**.

## 🧾 Before you start

- A name that resolves to the host, and a certificate for it
  ([HTTPS](/start/https/)).
- **UDP 443 open** in the provider's firewall and the host's. QUIC has no
  fallback: if UDP is blocked, clients use HTTP/2 and never mention it.
- A client with HTTP/3 support. The system `curl` on most distributions does not
  have it — asking anyway is explicit about it:

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 Turn it on

```caddyfile
{
    email bonjour@pingclair.com
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

Measured on the host, with the site running:

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

Removing `h3` from the list removes that listener; the list is the switch
([TLS: what you can tune](/guides/tls-tuning/#-which-protocols-are-served)).
Without a `protocols` line, HTTP/3 stays on.

The `tls` block also accepts a per-site switch:

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

⚠️ In v0.2.0-rc.3, `http3 off` is accepted and has no effect: the site is still
served over QUIC. **Next release:** it keeps that site off QUIC while the
listener serves the other sites, and its responses stop advertising HTTP/3 in
`Alt-Svc`.

## ✅ Prove a client used it

The proof comes from the client. Any curl built with ngtcp2 or quiche works,
and a container is the quickest way to get one on a host whose curl cannot do
HTTP/3:

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

`--network host` lets the container use the host's network directly. Without
it, the request may pass through a network namespace that blocks QUIC.

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

The first line is the answer: the status line says `HTTP/3`, not `HTTP/2`.
Requesting the same URL with `--http2` and `--http1.1` shows the other two
protocols, which confirms that the client is not falling back.

When a container is not available, a QUIC handshake can be checked with the
system's OpenSSL, if it is 3.5 or newer:

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` with a verified chain proves that the QUIC listener answers
for that name with a certificate the client trusts. It does not prove that a
full HTTP/3 request works; the curl check does that.

## 🧭 What differs on HTTP/3

HTTP/3 shares its policy code with HTTP/1.1 and HTTP/2, so routing, matchers,
headers, rate limits, FastCGI, and access logging behave the same. The
differences are where HTTP/3 cannot carry something:

| Area | On HTTP/3 |
| --- | --- |
| Declared request trailers | Not forwarded, as on every protocol: `501` before the response is committed; on HTTP/3 the stream is reset after that. |
| Upstream response trailers | `502`, as on every protocol. |
| `CONNECT` | Pingclair opens no tunnels. A standard `CONNECT` is reset as malformed, and one that also carries `:scheme` and `:path` is answered `501`. **Next release:** `405` with `Allow`, the same answer as on HTTP/1.1 and HTTP/2. |

A CDN in front of the origin terminates HTTP/3 itself and talks HTTP/1.1 or
HTTP/2 to the origin. The listener here then says nothing about what the
visitor's browser used; check the CDN's own HTTP/3 setting instead.

## ⚠️ When it does not work

- **`option --http3: the installed libcurl version doesn't support this`.** The
  client has no HTTP/3; use a container as above.
- **`curl --http3` hangs or times out.** UDP 443 is blocked somewhere. Check the
  provider's firewall or security group first, then the host's.
- **No UDP listener on the host.** `h3` is missing from the `servers` protocol
  list, or the file that is running is not the one you edited
  ([what a reload means](/start/service/#-what-a-reload-means)).
- **HTTP/3 works locally and not from outside.** The client's network blocks UDP
  443, which is common on corporate and hotel networks; browsers fall back
  silently.
- **A site with `http3 off` still answers over HTTP/3.** In v0.2.0-rc.3 the
  option has no effect; remove `h3` from the global list if no site may use
  HTTP/3.

## 🧭 Next steps

- [TLS: what you can tune](/guides/tls-tuning/): the protocol list, certificates,
  and client certificates.
- [Project status](/project/status/): what is supported, refused, and known
  broken in this release.
- [`tls`](/reference/directives/#tls): the `http3` option in context.
