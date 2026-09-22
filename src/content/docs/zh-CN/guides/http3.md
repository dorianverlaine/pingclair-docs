---
title: 提供 HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: 开启 HTTP/3、证明客户端真的用了它，并了解哪些请求在 QUIC 上行为不同。
---

HTTP/3 默认就是可用的：只要协议集合允许，服务器就会在 UDP 443 上打开 QUIC 监听，
不需要安装任何东西。需要小心的是验证 —— 一个悄悄退回 HTTP/2 的客户端，看起来和
成功一模一样。

## 🧾 开始之前

- 一个解析到本机的域名，以及它的证书（[HTTPS](/zh-CN/start/https/)）。
- 在服务商防火墙和主机上都**开放 UDP 443**。QUIC 没有回退：UDP 被挡住时，客户端
  用 HTTP/2，而且不会告诉你。
- 一个支持 HTTP/3 的客户端。多数发行版自带的 `curl` 不支持，直接要它会明说：

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 开启

```caddyfile
{
    email pingclair@aqeo.dev
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

站点运行中，在主机上实测：

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

把 `h3` 从列表里去掉，这个监听就消失；那个列表就是开关
（[TLS 能调什么](/zh-CN/guides/tls-tuning/#-which-protocols-are-served)）。也可以
在不停止监听的情况下，把单个站点移出 HTTP/3：

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

## ✅ 证明客户端用了它

服务器的访问日志不会写明协议，所以证据来自客户端。任何用 ngtcp2 或 quiche 构建的
curl 都行；在只有不支持 HTTP/3 的 curl 的主机上，用容器最快：

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

`--network host` 让容器使用主机的 UDP 路径；不加的话，请求可能经过一个阻断 QUIC 的
网络命名空间。

第一行就是全部答案：状态行写的是 `HTTP/3`，不是 `HTTP/2`。用 `--http2` 和
`--http1.1` 请求同一个 URL 会显示另外两个，从而证明客户端并不是在悄悄回退。

无法使用容器时，可以用系统的 OpenSSL（3.5 或更新）检查 QUIC 握手：

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` 加上校验通过的证书链，说明该域名的 QUIC 监听用客户端信任的证书
应答了。它并不证明一次完整的 HTTP/3 请求 —— 那是 curl 检查的任务。

## 🧭 HTTP/3 上有什么不同

策略层与 HTTP/1.1、HTTP/2 共用，所以路由、matcher、请求头、限速与访问日志行为
一致。不同的是传输层无法承载的部分：

| 领域 | 在 HTTP/3 上 |
| --- | --- |
| 声明的请求 trailer | 不转发：应答提交前 `501`，提交后重置流。 |
| 上游响应 trailer | `502`。 |
| `CONNECT` 与扩展 `CONNECT` | 隧道实现之前返回 `501`。 |
| `php_fastcgi` | `501`；FastCGI 只在 HTTP/1.1 与 HTTP/2 上提供。 |

前面有 CDN 时，终结 HTTP/3 的是 CDN，它用 HTTP/1.1 或 HTTP/2 与源站通信，所以这里
的监听无法证明访客浏览器用了什么；那要看 CDN 侧的 HTTP/3 设置。

## ⚠️ 出问题时

- **`option --http3: the installed libcurl version doesn't support this`。**
  客户端没有 HTTP/3；用上面的容器。
- **`curl --http3` 卡住或超时。** 某处挡住了 UDP 443。先查服务商防火墙或安全组，
  再查主机。
- **主机上没有 UDP 监听。** 协议列表里少了 `h3`，或者正在运行的不是你编辑的那个
  文件（[重载意味着什么](/zh-CN/start/service/#-what-a-reload-means)）。
- **本机能用、外面不能用。** 客户端网络阻断了 UDP 443，这在企业与酒店网络很常见；
  浏览器会静默回退。
- **FastCGI 路由返回 `501`。** 在 HTTP/3 上这是设计如此；[项目状态](/zh-CN/project/status/)
  列出了什么在哪种协议上提供。

## 🧭 下一步

- [TLS 能调什么](/zh-CN/guides/tls-tuning/)：协议列表、证书与客户端证书。
- [项目状态](/zh-CN/project/status/)：本版本支持什么、拒绝什么、已知什么缺陷。
- [`tls`](/zh-CN/reference/directives/#tls)：`http3` 选项的上下文。
