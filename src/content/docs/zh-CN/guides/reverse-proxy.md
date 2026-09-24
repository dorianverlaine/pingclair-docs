---
title: 反向代理一个应用
h1_emoji: '🔀'
sidebar:
  order: 1
description: 把 Pingclair 放在应用前面，把流量分摊到多个实例上，并在其中一个实例宕掉时继续提供服务。
---

反向代理在一个或多个应用实例前面放上一个公开地址，而无需改动应用本身。本页从单个上游开始，
逐步搭建一个带健康检查、超时和备用实例的上游池，最后说明另一侧的应用看到的是什么。

📌 本页描述的是最新发布的版本 **v0.2.0-rc.3**。仅存在于服务器 `main` 分支上的变化标记为 **下一版本**。

## 🧾 开始之前

- 已安装并运行 Pingclair（[安装](/zh-CN/start/install/)），试验期间先停掉服务：`sudo pc service stop`。
- 一个监听本地端口的应用。本页示例使用 `127.0.0.1:3000`。
- 代理自身使用的端口：示例中是 `:8080`。

## 🔀 单个上游

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

返回的是应用自己的响应，带着它自己的头部。`admin` 选项让 `pingclair reload` 能够连接运行中的服务器；
上面演示的 `SIGUSR1` 重载则不需要它（[重载意味着什么](/zh-CN/start/service/#-重载意味着什么)）。

## ⚖️ 多个上游

用 `to` 列出各个实例，再选择流量的分配方式：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

如果应用会报告是哪个端口响应的，六个请求会在两个实例之间交替：

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 行为 |
| --- | --- |
| `round_robin` | 按顺序每个上游一个请求。v0.2.0-rc.3 中的默认策略。 |
| `random` | 随机选择任意一个上游。 |
| `least_conn` | 选择进行中连接数最少的上游。 |
| `ip_hash` | 同一个客户端地址总是到达同一个上游。 |
| `first` | 本意是选择第一个可用的上游。在 v0.2.0-rc.3 中它的行为与 `round_robin` 相同。 |
| `header <name>`、`cookie <name>`、`query <name>` | 按该字段做哈希，让一个会话固定在一个实例上。 |
| `weighted_round_robin <w> …` | 在同一行上为每个上游指定一个权重。 |

**下一版本**：不写 `lb_policy` 时会随机选择上游，这是 Caddy 的默认行为；如果要保持轮流分配，
请写上 `lb_policy round_robin`。而 `first` 会真正固定到第一个可用的上游。

权重也可以写在每个上游上；当每个实例各有自己的理由时，这样写更清楚：

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

⚠️ `lb_policy weighted_round_robin 3 1` 把权重对应到写在它上方的上游，所以 `to` 行必须写在它**之前**。
顺序反过来时，`validate` 会以 `2 weights were given for 0 upstreams` 拒绝该文件。

标记为 `backup` 的上游只有在其他所有上游都不可用时才会被使用：

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

两个实例都在线时，所有请求都发往 `3000`。停掉那个进程，下一个请求就由 `3001` 响应。

## 🩺 健康检查

没有健康检查时，只有在发往某个上游的请求失败之后，它才会被移出轮换。健康检查在后台探测每个上游，
在用户请求到达之前就把失败的上游移除：

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

应用需要一个响应开销很小的端点，这里是 `/health`。每次状态变化都会记录日志，
通过它可以知道某个实例是什么时候离开轮换的：

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

在这份配置上实测：停掉第二个实例后，所有流量都流向第一个；它恢复后，经过 `consecutive_success`
次成功探测便重新加入。Caddy 的扁平写法（`health_uri`、`health_interval`、`health_timeout`、
`health_status`、`health_fails`、`health_passes`）配置的是同样的检查。

## ⏱️ 超时

超时设置写在 `reverse_proxy` 内部的 `transport http` 块中，而不是直接写在 `reverse_proxy` 下：

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

实测：`127.0.0.1:3099` 不接受任何连接时，`connect_timeout 1s` 耗费一秒，随后请求在第二个上游上重试，
得到 `200`。如果应用接受了连接，然后等待 3 秒才发送响应体，生效的则是 `first_byte_timeout 1s`，
客户端收到 `504`。

`dial_timeout` 不是 `reverse_proxy` 的选项；写在那里时，`validate` 会以
`Unknown directive 'reverse_proxy: dial_timeout'` 拒绝该文件。`transport http` 中对应的名称是
`connect_timeout`。

## 🔁 以主机名指定的上游

上游可以是主机名而不是地址。容器重启后换了 IP 地址时，需要的正是这一点：

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

主机名会按该间隔重新解析，每次刷新都会记录日志：

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

以 `/etc/hosts` 作为解析来源实测：把 `api.internal` 指向 `127.0.0.1` 时由第一个实例提供服务，
把文件改成 `127.0.0.2` 后，在一个间隔之内就由第二个实例提供服务，既不需要重启，也没有请求失败。
解析失败时，之前的地址会继续留在轮换中。

## 📨 上游看到的是什么

应用会在常用的头部中收到原始的 `Host` 和客户端地址：

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

如果 Pingclair 位于另一个代理之后，这些头部中的地址会是那个代理的地址，除非它被列入
`trusted_proxies`；[Cloudflare Tunnel 指南](/zh-CN/guides/cloudflare-tunnel/)介绍了这种情况。

## ⚠️ 出问题时

- **代理返回 `502`。** 没有任何上游响应。检查应用是否在监听（`sudo ss -ltnp | grep :3000`），
  以及地址是否一致。**下一版本**：由 Pingclair 生成的 `502` 或 `504` 会带有
  `Proxy-Status: pingclair; error=…`；没有这个字段的，来自应用本身。
- **停顿一段时间后返回 `504`。** 某个超时被触发了：后端慢是 `first_byte_timeout`，
  响应体慢是 `read_timeout`，主机始终不接受连接是 `connect_timeout`。
- **`Unknown directive 'reverse_proxy: …'`。** 这个选项属于某个嵌套块——超时在 `transport http` 下，
  检查在 `health_check` 下——`validate` 会给出它拒绝的准确写法。
- **配置变更没有生效。** 重载无法新增或移动监听。新文件涉及这类变更时，unit 的状态行会列出发生变化的地址，
  执行 `sudo pc service restart` 即可应用。参见[以服务方式运行](/zh-CN/start/service/#-重载意味着什么)。
- **所有请求都落在同一个实例上。** 它是唯一健康的实例。健康检查日志会说明其他实例何时以及为何离开轮换
  （`ConnectRefused`、`failure_statuses` 等）。

## 🧭 下一步

- [提供静态站点](/zh-CN/guides/static-site/)：压缩、缓存，以及单页应用的回退。
- [`reverse_proxy`](/zh-CN/reference/directives/#reverse_proxy)：指令参考。
- [以服务方式运行](/zh-CN/start/service/)：重载、重启和日志。
