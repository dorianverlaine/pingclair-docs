---
title: Run behind a Cloudflare Tunnel
h1_emoji: '☁️'
sidebar:
  order: 5
description: Publish a site through a Cloudflare Tunnel so the origin needs no inbound port, and make Pingclair's logs show the real client instead of the connector.
---

A Cloudflare Tunnel uses an outbound connection from `cloudflared` to
Cloudflare, and Cloudflare sends requests back over that connection. Nothing
listens on a public port, the edge terminates TLS, and the origin receives plain
HTTP on loopback. This page configures the tunnel, then configures the origin to
record the actual client address instead of `127.0.0.1`.

📌 This page describes **v0.2.2**.

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

Retrieve the connector credential with a separate API request:

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

That token is a secret: it lets any host join the tunnel. Treat it like a
password, and rotate it if it leaks.

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

The connector opens four connections to nearby Cloudflare locations, over QUIC
by default:

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 Route a hostname

The ingress rules decide which hostname reaches which origin service:

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

The last rule is the catch-all: a request for any other hostname receives `404`
instead of reaching the origin.

Create a proxied DNS record for the tunnel:

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

Verify the route from a host outside the origin network:

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` shows the edge answering. The origin was reached through the
tunnel, and no inbound port was opened for it.

<span id="-let-the-origin-see-the-client"></span>

## 🎯 Record the client address

Every request arrives from the connector on loopback, so by default the access
log records the connector, not the client:

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` lists the peers allowed to state the client address in
forwarding headers. The connector runs on the same host, so loopback is the
whole list:

```caddyfile
{
    admin 127.0.0.1:2019
    servers {
        trusted_proxies static 127.0.0.1/32
        client_ip_headers CF-Connecting-IP
    }
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

The same setting enables per-client rate limits and the `client_ip` matcher
to use the forwarded client address. It is read at startup, so a change
needs a restart rather than a reload
([what a reload means](/start/service/#-what-a-reload-means)).

`client_ip` and `{client_ip}` use the client from the listed headers; `remote_ip` and `{remote_host}` remain the connector address. Only trusted peers may supply these headers. `CF-Connecting-IP` must be listed explicitly in `client_ip_headers`.

<span id="️-when-it-does-not-work"></span>

## ⚠️ Troubleshooting

- **`HTTP/2 530` with `error code: 1033`.** The tunnel has no connector.
  `systemctl is-active cloudflared` on the origin reports its status;
  requests answer `200` again within seconds of the connector registering.
- **A request reaches a different site, or `404`.** The ingress rules are
  matched in order and end with the catch-all; check the hostname spelling in the
  rule before investigating DNS.
- **`502` from the edge.** The connector is running, but the origin service refused
  the connection: Pingclair is not listening on the port the rule names.
- **The access log records `127.0.0.1` for every client.** `trusted_proxies` is missing, as
  above.
- **The hostname does not resolve.** The record has to be a proxied CNAME to
  `<tunnel-id>.cfargotunnel.com`; a DNS-only record bypasses the tunnel
  entirely.
- **The connector token was exposed.** Rotate the tunnel's token and reinstall the
  service with the new one.

## 🧭 Next steps

- [Serve a static site](/guides/static-site/): the origin these examples point
  at.
- [TLS: what you can tune](/guides/tls-tuning/): what the origin can do with
  certificates when the edge is not terminating.
- [Run it as a service](/start/service/): the unit on the origin, and the reload
  semantics the `trusted_proxies` note refers to.
