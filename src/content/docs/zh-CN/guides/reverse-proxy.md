---
title: 反向代理一个应用
h1_emoji: '🔀'
sidebar:
  order: 1
description: 把 Pingclair 放在应用前面，把流量分散到多个实例，并在其中一台挂掉时继续服务。
---

反向代理是大多数人最初想要的东西：一个公开地址、后面一到多个应用实例、应用本身
不用改。本页从单个上游开始，一直搭到带健康检查、超时和备用的上游池，并展示应用
在另一侧看到什么。

## 🧾 开始之前

- 已经安装并运行 Pingclair（[安装](/zh-CN/start/install/)），实验期间先停掉服务：
  `sudo pc service stop`。
- 一个在本地端口监听的应用。示例用 `127.0.0.1:3000`。
- 代理自己的端口，示例用 `:8080`。

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

响应来自应用，它的响应头原样透传。`admin` 是为了让 `pingclair reload` 能联系
运行中的服务器；`SIGUSR1` 不需要它（[重载意味着什么](/zh-CN/start/service/#-what-a-reload-means)）。

## ⚖️ 多个上游

用 `to` 列出实例，再选择分流方式：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

两台都活着时，六次请求会交替；这是用「哪个端口回答了」的应用测出来的：

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 行为 |
| --- | --- |
| `round_robin` | 按顺序每个上游一次。默认值。 |
| `random` | 随机选一个上游。 |
| `least_conn` | 当前连接数最少的上游。 |
| `ip_hash` | 同一客户端地址总是落到同一台。 |
| `first` | 第一个可用的上游。 |
| `header <名>`, `cookie <名>`, `query <名>` | 按该字段哈希，让会话固定在一台。 |
| `weighted_round_robin <权重> …` | 在同一行给出每台上游的权重。 |

权重也可以逐台写，当理由各不相同时更好读：

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

⚠️ `lb_policy weighted_round_robin 3 1` 数的是已经写出来的上游，所以 `to` 行必须
写在**前面**。写反了，`validate` 会用
`2 weights were given for 0 upstreams` 拒绝该文件。

标了 `backup` 的上游只在其他上游全部不可用时才使用：

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

两台都在时，所有请求都去 `3000`。停掉那个进程，下一个请求由 `3001` 应答。

## 🩺 健康检查

没有检查时，上游要等到某个请求失败之后才会被摘掉；有检查则会提前摘掉：

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

应用需要一个便宜就能应答的端点（这里是 `/health`）。每次状态变化都会写进日志，
这也是查清某台为什么被摘掉的办法：

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

在这套配置上实测：杀掉第二台，全部流量转到第一台；它回来后，在
`consecutive_success` 次成功探测之后重新加入轮换。真实 Caddyfile 常用的扁平写法
（`health_uri`、`health_interval`、`health_timeout`、`health_status`、
`health_fails`、`health_passes`）设置的是同一个检查。

## ⏱️ 超时

超时写在 `reverse_proxy` 里面的 `transport http` 块中，而不是直接写在它下面：

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

实测：`127.0.0.1:3099` 什么都不接受时，`connect_timeout 1s` 花掉一秒，请求会重试
到第二个上游并拿到 `200`。只接受连接、正文等三秒的应用会触发
`first_byte_timeout 1s`，客户端收到 `504`。

`dial_timeout` 不是 `reverse_proxy` 的选项；写在那里，`validate` 会用
`Unknown directive 'reverse_proxy: dial_timeout'` 拒绝。`transport http` 里的名字
是 `connect_timeout`。

## 🔁 用域名指定上游

上游可以是名字而不是地址，这正是换了 IP 重新起来的容器需要的：

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

按这个间隔重新解析域名，变化会写进日志：

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

把 `/etc/hosts` 当作唯一事实来源实测：把 `api.internal` 指向 `127.0.0.1` 时由第一台
应答；改成 `127.0.0.2` 后，在一个间隔内改由第二台应答，不需要重启，也没有请求
失败。解析失败时，轮换里会保留上一个地址。

## 📨 上游看到什么

应用收到原始的 `Host`，以及按惯例放在请求头里的客户端地址：

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

如果前面还有一层代理，除非它被列进 `trusted_proxies`，这些头里的地址就是那一层
的地址；[Cloudflare Tunnel 指南](/zh-CN/guides/cloudflare-tunnel/) 讲的正是这种
情况。

## ⚠️ 出问题时

- **代理返回 `502`。** 没有任何上游应答。确认应用在监听
  （`sudo ss -ltnp | grep :3000`），地址也没写错。
- **停顿后 `504`。** 有超时触发：后端慢是 `first_byte_timeout`，正文慢是
  `read_timeout`，对方从不接受连接是 `connect_timeout`。
- **`Unknown directive 'reverse_proxy: …'`。** 该选项属于嵌套块 —— 超时在
  `transport http` 下，检查在 `health_check` 下 —— `validate` 会指明它拒绝的
  确切写法。
- **配置改动没有生效。** 重载应用的是策略，不是新的监听器；而 `pc service
  reload` 什么都不应用，见 [以服务方式运行](/zh-CN/start/service/#-what-a-reload-means)。
- **所有请求都落到同一台。** 那是唯一健康的上游。健康检查日志会说明其他几台何时
  因何被摘掉（`ConnectRefused`、`failure_statuses` 等）。

## 🧭 下一步

- [提供静态站点](/zh-CN/guides/static-site/)：压缩、缓存，以及单页应用的回退。
- [`reverse_proxy`](/zh-CN/reference/directives/#reverse_proxy)：指令参考。
- [以服务方式运行](/zh-CN/start/service/)：重载、重启与日志。
