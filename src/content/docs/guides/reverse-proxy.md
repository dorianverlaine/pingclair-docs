---
title: Proxy an application
h1_emoji: '🔀'
sidebar:
  order: 1
description: Put Pingclair in front of an application, spread traffic over several instances, and keep serving when one of them dies.
---

A reverse proxy is the configuration most people arrive for: one public address,
one or more application instances behind it, and no changes to the application.
This page builds that up from a single upstream to a pool with health checks,
timeouts, and a backup, and shows what the application sees on the other side.

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

The response is the application's, and its own headers are passed through. The
`admin` option is there so `pingclair reload` can reach the running server;
`SIGUSR1` does not need it ([what a reload means](/start/service/#-what-a-reload-means)).

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

Six requests across two live instances alternate, measured with an application
that reports which port answered:

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | Behavior |
| --- | --- |
| `round_robin` | One request per upstream, in order. The default. |
| `random` | Any upstream, chosen at random. |
| `least_conn` | The upstream with the fewest connections in flight. |
| `ip_hash` | The same client address always reaches the same upstream. |
| `first` | The first upstream that is available. |
| `header <name>`, `cookie <name>`, `query <name>` | Hash on that field, so a session sticks to one instance. |
| `weighted_round_robin <w> …` | One weight per upstream, on the same line. |

Weights also work per upstream, which reads better when the reasons differ per
instance:

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

⚠️ `lb_policy weighted_round_robin 3 1` counts the upstreams that have already
been written, so the `to` lines have to come **before** it. Written the other way
round, `validate` refuses the file with
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

Without a check, an upstream is only removed once a request to it fails. A check
takes it out of rotation first:

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

The application needs an endpoint that answers cheaply — here `/health`. Each
state change is logged, which is how you find out why an instance left rotation:

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

Measured on this configuration: with the second instance killed, all traffic went
to the first; when it came back, it rejoined after `consecutive_success`
successful probes. The same options exist in the flat spelling real Caddyfiles
use (`health_uri`, `health_interval`, `health_timeout`, `health_status`,
`health_fails`, `health_passes`), and they configure the same check.

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

An upstream may be a name instead of an address, which is what a container that
restarts on a new IP needs:

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

The name is re-resolved on that interval, and the change is logged:

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
- **`504` after a pause.** A timeout fired: `first_byte_timeout` for a slow
  backend, `read_timeout` for a slow body, `connect_timeout` for a host that
  never accepts.
- **`Unknown directive 'reverse_proxy: …'`.** The option belongs to a nested
  block — timeouts under `transport http`, checks under `health_check` — and
  `validate` names the exact spelling it refused.
- **A configuration change does not take effect.** Reload applies policy, not a
  new listener: when a reload added or moved one, the unit's status line names
  the addresses that changed and `sudo pc service restart` is what applies
  them. See [Run it as a service](/start/service/#-what-a-reload-means).
- **Every request lands on one instance.** It is the only healthy one. The health
  check log says when the others left rotation, and why (`ConnectRefused`,
  `failure_statuses`, and so on).

## 🧭 Next steps

- [Serve a static site](/guides/static-site/): compression, caching, and a
  fallback for single-page applications.
- [`reverse_proxy`](/reference/directives/#reverse_proxy): the directive
  reference.
- [Run it as a service](/start/service/): reloads, restarts, and logs.
