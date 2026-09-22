---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: 为公开域名取得证书、发布内部证书，或带自己的证书进来，并验证服务器实际在提供什么。
---

只要站点块的地址是公开域名，不需要 `tls` 指令就有了 HTTPS：Pingclair 通过 ACME
向 Let's Encrypt 申请证书，在 80 端口应答 HTTP-01 挑战，保存结果，并在后台续期。
其余三种取得证书的方式 —— DNS-01、本地证书颁发机构、自己提供的文件 —— 下面分别
说明各自需要什么，以及在 v0.2.0-rc.3 里实际是什么行为。

## 🧾 开始之前

- 一个解析到这台主机的名字。先确认它，再怀疑服务器：`dig +short A example.com`。
- 80 和 443 端口能从公网访问。HTTP-01 挑战在 80 端口应答，证书在 443 上使用。
- 一个用于 ACME 账号的邮箱地址。必须是真实邮箱：Let's Encrypt 拒绝保留的
  example 域名，签发会以 `contact email has forbidden domain "example.com"` 失败。

下面的配置会替换服务运行的 `/etc/Pingclair/Pingclairfile`。重载前先校验，
这个流程见[快速开始](/zh-CN/start/quickstart/)，重载语义见
[以服务方式运行](/zh-CN/start/service/)。

## 🌐 来自 Let's Encrypt 的证书

```caddyfile
{
    email pingclair@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

没有别的要配。启动时服务器登记该主机名、启动 ACME 流程并应答挑战：

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

访问日志里那条挑战请求来自证书颁发机构，不是浏览器：

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

从另一台机器验证实际提供的内容：

```bash
curl -I https://example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
etag: "493b-6ab1f452"
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

```text
subject=CN=example.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 22 02:35:03 2026 GMT
notAfter=Dec 21 02:35:02 2026 GMT
```

证书实体保存在服务账号的数据目录，
`/var/lib/pingclair/.local/share/pingclair`——二进制从该账号的 home 解析出来的
路径，也是以别的用户运行命令时 `PINGCLAIR_TLS_STORE` 指定的那个。

## 📡 DNS-01 与通配符

DNS-01 用发布 TXT 记录来证明对域名的控制，而不是在 80 端口应答，通配符证书必须
走这条路。配置里需要服务商块：

```caddyfile
{
    email pingclair@pingclair.com
}

*.example.com {
    tls {
        auto
        dns cloudflare <token>
        resolvers 1.1.1.1
        propagation_delay 10s
    }
    file_server /var/lib/pingclair/html
}
```

有两个容易漏掉的细节。块里的 `auto` 行才会把域名放进签发名单；不写它，服务器会
记录 `authorised for 0 hostname(s)`，完全不申请证书，所有握手都以
`NO_CERTIFICATE_SET` 失败。另外 token 是 Cloudflare API token，需要该域名所在
区域的 `Zone:DNS:Edit` 权限。

⚠️ **在 v0.2.0-rc.3 里 DNS-01 签发无法完成。** 挑战本身是跑起来的：记录发布了，
按配置指定的解析器确认了传播，也请求了颁发机构做校验。随后订单在一秒内变成
invalid，试过的每个域名都是如此，证书从未落盘：

```text
📡 Published the DNS-01 record for _acme-challenge.example.com via cloudflare
👍 DNS-01 record for _acme-challenge.example.com is visible
🚀 Verification triggered for example.com
⏳ Polling order status...
⚠️ Eager issuance failed for example.com: Order ended in state: Invalid
```

在修好之前，公开域名请用 HTTP-01。因此通配符域名暂时还不能带证书提供服务；替代
方案是每个名字单独一张证书，或者在别处签发后以文件形式提供。

## 🏛️ 来自内部证书颁发机构的证书

对于私有源站 —— 隧道、内部主机名、实验机器 —— Pingclair 可以自己当颁发机构：

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

站点会提供由 `CN=Pingclair Local Authority` 签发、有效期十年的证书，根证书发布在
存储里：

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

客户端还不信任它，所以不带 `-k` 的请求会失败。把根证书装进系统信任存储：

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

`PINGCLAIR_TLS_STORE` 前缀很重要：`pingclair trust` 看的是执行它的用户的存储
（root 就是 `/root/.local/share/pingclair`），而服务用的是
`/var/lib/pingclair/.local/share/pingclair`。不加前缀，命令会回答
`No internal CA root at /root/.local/share/pingclair/internal/root.crt`。

信任根证书之后，同样的请求不带 `-k` 也会成功：

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` 用同样的存储前缀把它移除。

## 📜 自己提供的证书

当另一个系统签发你的证书时，让 `tls` 指向那些文件：

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

文件必须能被 `pingclair` 用户读取，因为服务以该用户运行。`validate` 会拒绝不存在
的路径，而不是等到第一次握手才失败：

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ HTTPS 起不来时

- **`contact email has forbidden domain "example.com"`。** Let's Encrypt 拒绝把
  保留的 example 域名作为账号联系方式。请在 `email` 选项里填真实邮箱。
- **日志里的 `NO_CERTIFICATE_SET`。** 握手带来了服务器没有证书的域名。往上读
  日志：没有 `auto` 的 `tls` 块不会启动签发，而 DNS-01 在这个版本里无法完成。
- **挑战从未被提供。** 80 端口被防火墙挡住，或者被别的东西占用。颁发机构必须能
  从公网访问 `http://your-name/.well-known/acme-challenge/`。
- **域名没有解析到这台主机。** `dig +short A your-name` 显示颁发机构会连到哪里，
  最近改动过解析之后，结果常常和想的不一样。
- **反复失败。** Let's Encrypt 会对每个域名的失败校验限流。先修好原因再重试，
  否则重试本身就成了错误。

## 🧭 下一步

- [以服务方式运行](/zh-CN/start/service/)：unit、重载语义与日志。
- [`tls`](/zh-CN/reference/directives/#tls)：该指令的全部模式与选项。
- [Pingclairfile](/zh-CN/reference/pingclairfile/)：地址、matcher，以及编译器
  接受什么。
