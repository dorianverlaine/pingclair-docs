---
title: 跑在 Cloudflare Tunnel 后面
h1_emoji: '☁️'
sidebar:
  order: 5
description: 通过 Cloudflare Tunnel 发布站点，让源站不需要任何入站端口，并让 Pingclair 的日志显示真实客户端而不是连接器。
---

Cloudflare Tunnel 把源站向外连接：`cloudflared` 主动拨号到 Cloudflare，Cloudflare
再把请求沿这条连接送回来。没有东西监听公开端口，边缘终结 TLS，源站只看到回环上的
明文 HTTP。本页把它搭起来，并修掉每次都会先踩的那个坑 —— 所有请求都记成
`127.0.0.1`。

## 🧾 开始之前

- 域名在 Cloudflare 账号里，并且能用 Zero Trust。
- `cloudflared` 与 Pingclair 在同一台主机上，Pingclair 正在提供站点
  （[提供静态站点](/zh-CN/guides/static-site/)）。
- 用仪表盘（Zero Trust → Networks → Tunnels），或者一个带 **Cloudflare Tunnel:
  Write** 与区域 **DNS: Edit** 的 API token。示例走 API，需要设置 `$CF_TOKEN`、
  `$ACCOUNT`、`$ZONE`。

## 🌐 创建 tunnel

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` 让 tunnel 变成**远程管理**：ingress 规则存在 Cloudflare
一侧并通过 API 下发，连接器旁边不需要写任何文件。

连接器凭据要另一次调用：

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

这个 token 是机密，它让一台主机加入 tunnel。按密码对待，泄漏就轮换。

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

连接器会向最近的 Cloudflare 站点注册四条连接，默认走 QUIC：

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 把域名接到 tunnel

ingress 规则决定哪个域名到达哪个源站服务：

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

最后一条是兜底：其他域名得到 `404`，而不是默认站点。

然后把域名指向 tunnel，代理要打开：

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

从任何地方：

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` 是边缘在应答；源站是通过 tunnel 到达的，没有开放任何端口。

## 🎯 让源站看到客户端

默认情况下每个请求都从连接器经回环到达，访问日志对「客户端是谁」一无所知：

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` 告诉 Pingclair 哪些对端可以声明客户端地址。连接器跑在同一台
主机上，所以回环网段就够：

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

同一个请求在该选项前后的实测：

```text
remote_ip=127.0.0.1          # 之前
remote_ip=16.162.199.171     # 之后：发起请求的客户端
```

这个设置也让基于 IP 的限速与规则在 tunnel 后面变得有意义。它在启动时确立，所以
改动需要重启而不是重载，见
[重载意味着什么](/zh-CN/start/service/#-重载意味着什么)。

## ⚠️ 出问题时

- **`HTTP/2 530` 与 `error code: 1033`。** tunnel 没有连接器。源站上的
  `systemctl is-active cloudflared` 能说明状态；连接器注册后几秒内请求就恢复
  `200`。
- **请求打到别的站点，或 `404`。** ingress 规则按顺序匹配并以兜底结束；先检查
  规则里的域名拼写，再怀疑 DNS。
- **边缘返回 `502`。** 连接器在，但源站服务拒绝了连接：规则指的那个端口上
  Pingclair 没有监听。
- **访问日志总是 `127.0.0.1`。** 缺 `trusted_proxies`，见上。
- **域名不解析。** 记录必须是指向 `<tunnel-id>.cfargotunnel.com` 的**代理** CNAME；
  灰云记录会直接绕过 tunnel。
- **连接器 token 泄漏。** 删除该 tunnel 的 token 并用新的重新安装服务；旧凭据
  本来也无法从 API 取回。

## 🧭 下一步

- [提供静态站点](/zh-CN/guides/static-site/)：这些示例指向的源站。
- [TLS 能调什么](/zh-CN/guides/tls-tuning/)：边缘不终结 TLS 时，源站能用证书
  做什么。
- [以服务方式运行](/zh-CN/start/service/)：源站上的 unit，以及 `trusted_proxies`
  那条提醒引用的重载语义。
