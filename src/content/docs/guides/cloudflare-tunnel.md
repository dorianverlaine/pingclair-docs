---
title: Run behind a Cloudflare Tunnel
h1_emoji: '☁️'
sidebar:
  order: 5
description: Publish a site through a Cloudflare Tunnel so the origin needs no inbound port, and make Pingclair's logs show the real client instead of the connector.
---

A Cloudflare Tunnel connects the origin outward: `cloudflared` dials Cloudflare,
and Cloudflare sends requests back down that connection. Nothing listens on a
public port, the edge terminates TLS, and the origin sees plain HTTP on loopback.
This page sets that up and fixes the one thing that always goes wrong first —
every request logging `127.0.0.1`.

## 🧾 Before you start

- The domain in a Cloudflare account, with Zero Trust available.
- `cloudflared` on the same host as Pingclair, and Pingclair serving the site
  ([Serve a static site](/guides/static-site/)).
- Either the dashboard (Zero Trust → Networks → Tunnels) or an API token with
  **Cloudflare Tunnel: Write** and **DNS: Edit** for the zone. The examples here
  use the API, with `$CF_TOKEN`, `$ACCOUNT` and `$ZONE` set to the token, the
  account ID, and the zone ID.

## 🌐 Create the tunnel

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` means the tunnel is **remotely managed**: its ingress
rules live in Cloudflare and are pushed through the API, so nothing has to be
written next to the connector.

The connector credential is a separate call:

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

That token is a secret — it is what lets a host join the tunnel. Treat it like a
password and rotate it if it leaks.

## 🔌 Connect the host

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install "$TUNNEL_TOKEN"
```

```text
INF Linux service for cloudflared installed successfully
```

The connector registers four connections to the nearest Cloudflare locations and
uses QUIC by default:

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 Route a hostname

The ingress rules decide which hostname reaches which origin service:

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.aqeo.dev","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

The last rule is the catch-all: a request for any other hostname gets `404`
rather than the default site.

Then point the name at the tunnel, with the proxy on:

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.aqeo.dev","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

From anywhere:

```bash
curl -I https://tunnel-test.aqeo.dev/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` is the edge answering; the origin was reached over the
tunnel, and no port had to be opened for it.

## 🎯 Let the origin see the client

By default every request arrives from the connector on loopback, so the access
log is useless for anything that cares who the client was:

```text
📝 Access … host="tunnel-test.aqeo.dev" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` tells Pingclair which peers may assert the client address. The
connector runs on the same host, so the loopback range is the whole list:

```caddyfile
{
    admin 127.0.0.1:2019
    trusted_proxies 127.0.0.1/32
}

http://:80 {
    root * /srv/site
    file_server
}
```

Measured, with the same request before and after the option:

```text
remote_ip=127.0.0.1          # before
remote_ip=16.162.199.171     # after: the client that started the request
```

This is also the setting that makes per-IP rate limiting and IP-based rules mean
anything behind a tunnel. It is established at startup, so changing it needs a
restart rather than a reload
([what a reload means](/start/service/#-what-a-reload-means)).

## ⚠️ When it does not work

- **`HTTP/2 530` with `error code: 1033`.** The tunnel has no connector.
  `systemctl is-active cloudflared` on the origin says whether it is running;
  requests answer `200` again within seconds of the connector registering.
- **A request reaches a different site, or `404`.** The ingress rules are
  matched in order and end with the catch-all; check the hostname spelling in the
  rule before blaming DNS.
- **`502` from the edge.** The connector is up, but the origin service refused
  the connection: Pingclair is not listening on the port the rule names.
- **The access log always says `127.0.0.1`.** `trusted_proxies` is missing, as
  above.
- **The hostname does not resolve.** The record has to be a proxied CNAME to
  `<tunnel-id>.cfargotunnel.com`; a grey-cloud record bypasses the tunnel
  entirely.
- **The connector token leaked.** Delete the tunnel's tokens and reinstall the
  service with the new one; the old credential cannot be recovered from the API
  anyway.

## 🧭 Next steps

- [Serve a static site](/guides/static-site/): the origin these examples point
  at.
- [TLS: what you can tune](/guides/tls-tuning/): what the origin can do with
  certificates when the edge is not terminating.
- [Run it as a service](/start/service/): the unit on the origin, and the reload
  semantics the `trusted_proxies` note refers to.
