---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: 为公网域名获取证书、发布内部证书或使用自己的证书，并确认服务器实际提供的是哪一张证书。
---

站点块的地址是公网域名时，不需要写 `tls` 指令就能获得 HTTPS：Pingclair 通过 ACME 向
Let's Encrypt 申请证书，在 80 端口上响应 HTTP-01 质询，保存结果，并在后台续期。
获取证书的另外三种方式——DNS-01、本地证书颁发机构，以及你自己提供的文件——在下文逐一介绍，
并说明各自的前提条件。

## 🧾 开始之前

- 一个解析到这台主机的域名。怀疑服务器之前先检查它：`dig +short A example.com`。
- 80 和 443 端口能从互联网访问。HTTP-01 质询在 80 端口上提供，证书则用在 443 端口上。
- 一个用于 ACME 账户的邮箱地址。它必须是真实的邮箱：Let's Encrypt 拒绝保留的示例域名，
  签发会以 `contact email has forbidden domain "example.com"` 失败。

下面的配置会替换服务运行的 `/etc/Pingclair/Pingclairfile`。重载之前先校验；
[快速开始](/zh-CN/start/quickstart/)演示了这个流程，[以服务方式运行](/zh-CN/start/service/)
解释了重载。

## 🌐 来自 Let's Encrypt 的证书

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

不需要其他配置。服务器启动时会授权该主机名，开始 ACME 流程，并提供质询响应：

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

访问日志中的质询请求来自证书颁发机构，而不是浏览器：

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

从另一台机器确认实际提供的内容：

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

证书材料保存在服务用户的数据目录 `/var/lib/pingclair/.local/share/pingclair` 中——
这是二进制文件根据该账户的主目录推导出的路径，也是以其他用户身份运行命令时
`PINGCLAIR_TLS_STORE` 应当指向的位置。

## 📡 DNS-01 与通配符证书

DNS-01 通过发布一条 TXT 记录来证明对域名的控制权，而不是在 80 端口上响应。
通配符证书必须使用它，80 端口关闭的主机也一样。

⚠️ **DNS-01 在 v0.2.0-rc.3 中无法完成。** 该版本在 TXT 记录中发布了错误的值，
所以每个订单都以 `Invalid` 告终。修复以及下文介绍的单张通配符证书都在 `main` 上，尚未发布。
如果现在就要使用 DNS-01，请用安装脚本的 `--main` 参数安装 `main`
（[安装](/zh-CN/start/install/#-通过发布版二进制文件安装)）。本节的输出展示的就是该构建的行为。

配置中需要提供商块：

```caddyfile
{
    email bonjour@pingclair.com
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

有两处细节容易忽略。第一，块中的 `auto` 这一行才会把域名放进签发列表；没有它，服务器会记录
`authorised for 0 hostname(s)`，从不申请证书，每次握手都以 `NO_CERTIFICATE_SET` 失败。
第二，令牌是 Cloudflare API 令牌，对该域名所在的区域拥有 `Zone:DNS:Edit` 权限。

🃏 **一张叶证书覆盖整个站点。** `*.example.com` 站点申请的就是 `*.example.com` 本身：
一张证书，启动时获取，提供给其下的每一个名称。通配符只覆盖一级标签，所以顶级域名需要单独列出——
如果站点也在 `example.com` 上响应，请写成 `*.example.com, example.com`，每个主体都按书写的样子申请。
以这种方式提供服务的子域名不会出现在证书透明度（Certificate Transparency）日志中，
这正是选择通配符证书的隐私理由。

站点下的任何名称都由这一张叶证书提供。从另一台机器验证：

```bash
curl -I https://anything.example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername anything.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName
```

```text
subject=CN=*.example.com
issuer=C=US, O=Let's Encrypt, CN=YE1
X509v3 Subject Alternative Name:
    DNS:*.example.com
```

## 🏛️ 来自内部证书颁发机构的证书

对于私有源站——隧道、内部主机名、实验机——Pingclair 可以充当自己的证书颁发机构：

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

站点使用由 `CN=Pingclair Local Authority` 签发、有效期十年的证书响应，根证书发布在存储中：

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

客户端此时还不信任它，所以不带 `-k` 的请求会失败。把根证书安装到系统信任库中：

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

`PINGCLAIR_TLS_STORE` 前缀不可省略：`pingclair trust` 查找的是运行它的用户的存储，对 root 而言是
`/root/.local/share/pingclair`，而服务使用的是 `/var/lib/pingclair/.local/share/pingclair`。
没有这个前缀，它会回答 `No internal CA root at /root/.local/share/pingclair/internal/root.crt`。

信任根证书之后，同样的请求不带 `-k` 也能成功：

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` 可以再次移除它，同样需要带上存储前缀。

📌 **下一版本**：内部证书颁发机构将像 Caddy 那样组织：放在存储的 `pki/authorities/local/` 下，
并由一张中间证书签发叶证书。旧的 `internal/` 目录不会迁移：升级后服务器会创建新的根证书，
每个客户端都必须用 `pingclair trust` 重新信任它。

## 📜 自己提供的证书

证书由其他系统签发时，把 `tls` 指向这些文件：

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

这些文件必须能被 `pingclair` 用户读取，因为服务以该用户身份运行。对于不存在的路径，
`validate` 会直接拒绝，而不是等到第一次握手时才失败：

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ HTTPS 起不来时

- **`contact email has forbidden domain "example.com"`。** Let's Encrypt 不接受保留的示例域名作为
  账户联系方式。请在 `email` 选项中填写真实的邮箱。
- **日志中出现 `NO_CERTIFICATE_SET`。** 握手时出示的名称在服务器上没有对应的证书。
  查看它上方的日志：没有 `auto` 的 `tls` 块从不启动签发，而 DNS-01 在本版本中无法完成。
- **质询始终没有被提供。** 80 端口被防火墙拦截，或者被其他程序占用。证书颁发机构必须能从互联网访问
  `http://your-name/.well-known/acme-challenge/`。
- **域名没有解析到这台主机。** `dig +short A your-name` 会显示证书颁发机构将要连接的地址；
  刚改过解析时，结果未必如你所料。
- **反复失败。** Let's Encrypt 会按主机名限制失败的验证次数。先修复原因再重试，
  否则重试本身就会成为错误。

## 🧭 下一步

- [以服务方式运行](/zh-CN/start/service/)：unit、它的重载语义和日志。
- [`tls`](/zh-CN/reference/directives/#tls)：该指令的全部模式与选项。
- [Pingclairfile](/zh-CN/reference/pingclairfile/)：地址、匹配器，以及编译器接受什么。
