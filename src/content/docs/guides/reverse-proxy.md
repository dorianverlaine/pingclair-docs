---
title: Proxy an application
h1_emoji: '🔀'
sidebar:
  order: 1
description: Put Pingclair in front of an application, spread traffic over several instances, and keep serving when one of them dies.
---

A reverse proxy puts one public address in front of one or more application
instances, without changing the application. This page starts with a single
upstream and builds up to a pool with health checks, timeouts, and a backup. It
ends with what the application sees on the other side.

📌 This page describes **v0.2.0-rc.3**, the latest published release. Changes
that exist only on the server's `main` branch are marked **Next release**.

## 🧾 Before you start

- Pingclair installed and running ([Install](/start/install/)), with the service
  stopped while you experiment: `sudo pc service stop`.
- An application listening on a local port. The examples here use
  `127.0.0.1:3000`.
- A port for the proxy itself: `:8080` in the examples.

## 🔀 One upstream

```caddyfile
{
    admin 127.0.0.1:2019
}

http://:8080 {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
curl -i http://localhost:8080/
```

The response is the application's, with its own headers. The `admin` option
lets `pingclair reload` reach the running server; the `SIGUSR1` reload shown
above works without it ([what a reload means](/start/service/#-what-a-reload-means)).

## ⚖️ Several upstreams

List the instances with `to`, then choose how traffic is divided:

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

With an application that reports which port answered, six requests alternate
between the two instances:

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | Behavior |
| --- | --- |
| `round_robin` | One request per upstream, in order. The default in v0.2.0-rc.3. |
| `random` | Any upstream, chosen at random. |
| `least_conn` | The upstream with the fewest connections in flight. |
| `ip_hash` | The same client address always reaches the same upstream. |
| `first` | Intended to pick the first available upstream. In v0.2.0-rc.3 it behaves like `round_robin`. |
| `header <name>`, `cookie <name>`, `query <name>` | Hash on that field, so a session sticks to one instance. |
| `weighted_round_robin <w> …` | One weight per upstream, on the same line. |

**Next release:** with no `lb_policy`, an upstream is picked at random, which
is Caddy's default; write `lb_policy round_robin` to keep the alternation. And
`first` really does pin to the first available upstream.

A weight can also be set on each upstream, which reads better when each instance
has its own reason:

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000 {
            weight 3
        }
        to 127.0.0.1:3001
    }
}
```

⚠️ `lb_policy weighted_round_robin 3 1` matches its weights to the upstreams
written above it, so the `to` lines must come **before** it. In the other order,
`validate` refuses the file with
`2 weights were given for 0 upstreams`.

An upstream marked `backup` is used only when every other upstream is
unavailable:

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001 {
            backup
        }
    }
}
```

With both alive, every request goes to `3000`. Stop that process and the next
request is answered by `3001`.

## 🩺 Health checks

Without a health check, an upstream leaves rotation only after a request to it
fails. A health check probes each upstream in the background and removes a
failing one before a user request reaches it:

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        health_check {
            path /health
            interval 2s
            timeout 1s
            status 200
            consecutive_failure 2
            consecutive_success 1
        }
    }
}
```

The application needs an endpoint that answers cheaply, here `/health`. Each
change of state is logged, which is how to find out when an instance left
rotation:

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

Measured on this configuration: with the second instance stopped, all traffic
went to the first; when it came back, it rejoined after `consecutive_success`
successful probes. Caddy's flat spelling (`health_uri`, `health_interval`,
`health_timeout`, `health_status`, `health_fails`, `health_passes`) configures
the same check.

## ⏱️ Timeouts

Timeouts live in a `transport http` block inside `reverse_proxy`, not directly
under it:

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3099
        to 127.0.0.1:3000
        transport http {
            connect_timeout 1s
            first_byte_timeout 1s
            read_timeout 30s
            write_timeout 30s
        }
    }
}
```

Measured: with `127.0.0.1:3099` accepting nothing, `connect_timeout 1s` costs one
second and the request is retried against the second upstream, which answers
`200`. An application that accepts the connection and then waits 3 seconds for a
body gets `first_byte_timeout 1s` applied instead, and the client receives
`504`.

`dial_timeout` is not a `reverse_proxy` option; written there, `validate` refuses
the file with `Unknown directive 'reverse_proxy: dial_timeout'`. The name inside
`transport http` is `connect_timeout`.

## 🔁 Hostname upstreams

An upstream can be a hostname instead of an address. That is what a container
that restarts on a new IP address needs:

```caddyfile
{
    dns_refresh 5s
}

http://:8080 {
    reverse_proxy {
        to api.internal:3000
    }
}
```

The name is resolved again on that interval, and each refresh is logged:

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

Measured with `/etc/hosts` as the source of truth: pointing `api.internal` at
`127.0.0.1` served the first instance, editing the file to `127.0.0.2` served the
second within the interval, with no restart and no request failing. A lookup
that fails keeps the previous address in rotation.

## 📨 What the upstream sees

The application receives the original `Host` and the client's address in the
usual headers:

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

Behind another proxy, the address in those headers is that proxy's unless it is
listed in `trusted_proxies`; the [Cloudflare Tunnel
guide](/guides/cloudflare-tunnel/) covers that case.

## ⚠️ When it does not work

- **`502` from the proxy.** No upstream answered. Check that the application is
  listening (`sudo ss -ltnp | grep :3000`) and that the address matches.
  **Next release:** a `502` or `504` that Pingclair generated carries
  `Proxy-Status: pingclair; error=…`; one without that field came from the
  application.
- **`504` after a pause.** A timeout fired: `first_byte_timeout` for a slow
  backend, `read_timeout` for a slow body, `connect_timeout` for a host that
  never accepts.
- **`Unknown directive 'reverse_proxy: …'`.** The option belongs to a nested
  block — timeouts under `transport http`, checks under `health_check` — and
  `validate` names the exact spelling it refused.
- **A configuration change does not take effect.** A reload cannot add or move
  a listener. When the new file does, the unit's status line names the
  addresses that changed, and `sudo pc service restart` applies them. See [Run it as a service](/start/service/#-what-a-reload-means).
- **Every request lands on one instance.** It is the only healthy one. The
  health check log says when the others left rotation, and why (`ConnectRefused`,
  `failure_statuses`, and so on).

## 🧭 Next steps

- [Serve a static site](/guides/static-site/): compression, caching, and a
  fallback for single-page applications.
- [`reverse_proxy`](/reference/directives/#reverse_proxy): the directive
  reference.
- [Run it as a service](/start/service/): reloads, restarts, and logs.
