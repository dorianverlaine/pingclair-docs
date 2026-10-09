---
title: Serve HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: Configure HTTP/3, verify the protocol used by the client, and understand request handling differences over QUIC.
---

HTTP/3 is enabled by default: an HTTPS site uses a QUIC listener on UDP 443 unless
the global protocol list excludes `h3`. Check the response protocol: a client
may use HTTP/2 after an HTTP/3 connection fails.

📌 This page describes **v0.2.2**.

## 🧾 Before you start

- A name that resolves to the host, and a certificate for it
  ([HTTPS](/start/https/)).
- **UDP 443 open** in the provider's firewall and the host's. If UDP is
  blocked, clients may use HTTP/2 instead.
- A client with HTTP/3 support. The system `curl` on most distributions does not
  have it and reports this error:

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

<span id="-turn-it-on"></span>

## 🔌 Configure HTTP/3

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

After starting the site, check the UDP listener on the host:

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

Removing `h3` from the list removes the QUIC listener
([TLS: what you can tune](/guides/tls-tuning/#-which-protocols-are-served)).
Without a `protocols` line, HTTP/3 remains enabled.

The `tls` block also accepts a per-site switch:

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

`http3 off` refuses this site's QUIC handshake and removes its HTTP/3 advertisement from `Alt-Svc`. Other sites on the port may continue to use QUIC.

<span id="-prove-a-client-used-it"></span>

## ✅ Verify the client protocol

Use an HTTP/3-capable client, such as curl built with ngtcp2 or quiche. If the
host's curl lacks HTTP/3 support, use a container:

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

The `HTTP/3` status line confirms the protocol used for this response.
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
following limitations apply:

| Area | On HTTP/3 |
| --- | --- |
| Declared request trailers | Not forwarded, as on every protocol: `501` before the response is committed; on HTTP/3 the stream is reset after that. |
| Upstream response trailers | Relayed, as on every protocol: the origin's status and body reach the client, and the trailer fields are dropped. |
| `CONNECT` | Pingclair opens no tunnels. A usable `host:port` target receives `405` with `Allow`; a target without a usable port receives `400`. HTTP/1.1 closes the connection after refusal. |

Trailer fields are the deliberate divergence in that table: Caddy and nginx
relay an origin's trailer fields to the client, while this proxy forwards the
`Trailer:` announcement and drops the fields behind it — a client that reads
the announcement waits for fields that never arrive (#273).

A CDN in front of the origin terminates HTTP/3 itself and uses HTTP/1.1 or
HTTP/2 to reach the origin. The origin listener does not identify the protocol
used between the browser and the CDN; check the CDN's HTTP/3 settings.

<span id="️-when-it-does-not-work"></span>

## ⚠️ Troubleshooting

- **`option --http3: the installed libcurl version doesn't support this`.** The
  client has no HTTP/3; use a container as above.
- **`curl --http3` does not complete or times out.** UDP 443 may be blocked. Check the
  provider's firewall or security group first, then the host's.
- **No UDP listener on the host.** `h3` is missing from the `servers` protocol
  list, or the file that is running is not the one you edited
  ([what a reload means](/start/service/#-what-a-reload-means)).
- **HTTP/3 works locally and not from outside.** The client's network may block UDP
  443; browsers may use HTTP/2 instead.

## 🧭 Next steps

- [TLS: what you can tune](/guides/tls-tuning/): the protocol list, certificates,
  and client certificates.
- [Project status](/project/status/): what is supported, refused, and affected by known
  defects in this release.
- [`tls`](/reference/directives/#tls): the `http3` option in context.
