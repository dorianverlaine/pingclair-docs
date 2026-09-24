---
title: 在 Cloudflare Tunnel 后面运行
h1_emoji: '☁️'
sidebar:
  order: 5
description: 通过 Cloudflare Tunnel 发布站点，让源站无需开放任何入站端口，并让 Pingclair 的日志显示真实客户端而不是连接器。
---

Cloudflare Tunnel 从源站向外建立连接：`cloudflared` 主动连接 Cloudflare，Cloudflare 再通过这条连接把请求送回来。
没有任何程序监听公网端口，TLS 在边缘终结，源站在回环地址上收到的是明文 HTTP。本页完成这套配置，
然后解决每个人都会遇到的第一个问题：所有请求在日志中都显示来自 `127.0.0.1`。

📌 本页描述的是 Pingclair 最新发布的版本 **v0.2.0-rc.3**。

## 🧾 开始之前

- 域名已托管在 Cloudflare 账户中，且可以使用 Zero Trust。
- `cloudflared` 与 Pingclair 在同一台主机上，并且 Pingclair 已经在提供该站点
  （[提供静态站点](/zh-CN/guides/static-site/)）。
- 使用控制台（Zero Trust → Networks → Tunnels），或者一个对该区域拥有 **Cloudflare Tunnel: Write**
  和 **DNS: Edit** 权限的 API 令牌。本页示例使用 API，`$CF_TOKEN`、`$ACCOUNT` 和 `$ZONE`
  分别设置为令牌、账户 ID 和区域 ID。

## 🌐 创建隧道

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` 表示这条隧道是**远程管理**的：它的入口规则保存在 Cloudflare 上，
通过 API 下发，所以连接器旁边不需要写任何文件。

连接器的凭据需要单独调用获取：

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

这个令牌是机密：任何主机拿到它都能加入这条隧道。请像对待密码一样对待它，一旦泄露就立即轮换。

## 🔌 连接主机

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install "$TUNNEL_TOKEN"
```

```text
INF Linux service for cloudflared installed successfully
```

连接器会向附近的 Cloudflare 节点建立四条连接，默认使用 QUIC：

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 为主机名配置路由

入口规则决定哪个主机名到达哪个源站服务：

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

最后一条是兜底规则：请求其他任何主机名都会得到 `404`，而不会到达源站。

然后把域名指向隧道，并开启代理：

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

从任意位置访问：

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` 表明是边缘在响应。请求经由隧道到达了源站，而源站没有为此开放任何入站端口。

## 🎯 让源站看到客户端

每个请求都从回环地址上的连接器到达，所以默认情况下，访问日志记录的是连接器，而不是客户端：

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` 列出允许在转发头部中声明客户端地址的对端。连接器运行在同一台主机上，
所以列表中只需要回环地址：

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

加上该选项前后，用同一个请求实测：

```text
remote_ip=127.0.0.1          # before
remote_ip=16.162.199.171     # after: the client that started the request
```

在隧道后面，按客户端限流和 `client_ip` 匹配器能看到真实客户端，靠的也是这个设置。
它在启动时读取，所以修改后需要重启而不是重载（[重载意味着什么](/zh-CN/start/service/#-重载意味着什么)）。

**下一版本**：`remote_ip` 匹配器匹配的是连接本身的对端，在隧道后面它永远是连接器。
要匹配客户端，请使用 `client_ip`；在 v0.2.0-rc.3 中，两个匹配器看到的都是转发过来的客户端。

## ⚠️ 出问题时

- **`HTTP/2 530` 并带有 `error code: 1033`。** 隧道没有连接器。在源站上执行
  `systemctl is-active cloudflared` 可以查看它是否在运行；连接器注册后几秒之内，请求就会重新返回 `200`。
- **请求到达了另一个站点，或者得到 `404`。** 入口规则按顺序匹配，并以兜底规则结束；
  怀疑 DNS 之前，先检查规则中主机名的拼写。
- **边缘返回 `502`。** 连接器在线，但源站服务拒绝了连接：Pingclair 没有在规则指定的端口上监听。
- **访问日志总是显示 `127.0.0.1`。** 缺少 `trusted_proxies`，处理方法见上文。
- **主机名无法解析。** 记录必须是指向 `<tunnel-id>.cfargotunnel.com` 且开启代理的 CNAME；
  灰色云朵（仅 DNS）的记录会完全绕过隧道。
- **连接器令牌泄露了。** 轮换隧道的令牌，并用新令牌重新安装服务。

## 🧭 下一步

- [提供静态站点](/zh-CN/guides/static-site/)：这些示例指向的源站。
- [TLS 能调什么](/zh-CN/guides/tls-tuning/)：边缘不终结 TLS 时，源站可以如何使用证书。
- [以服务方式运行](/zh-CN/start/service/)：源站上的 unit，以及 `trusted_proxies` 说明中提到的重载语义。
