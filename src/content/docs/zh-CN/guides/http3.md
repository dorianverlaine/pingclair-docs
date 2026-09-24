---
title: 提供 HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: 开启 HTTP/3，证明客户端确实用上了它，并了解哪些请求在 QUIC 上的行为有所不同。
---

HTTP/3 默认开启：只要全局协议列表没有去掉 `h3`，HTTPS 站点就会在 UDP 443 上获得一个 QUIC 监听。
真正需要花心思的是证明客户端确实用上了它，因为悄悄回退到 HTTP/2 的客户端看起来和成功一模一样。

📌 本页描述的是最新发布的版本 **v0.2.0-rc.3**。仅存在于服务器 `main` 分支上的变化标记为 **下一版本**。

## 🧾 开始之前

- 一个解析到该主机的域名，以及它的证书（[HTTPS](/zh-CN/start/https/)）。
- 在云服务商的防火墙和主机的防火墙中**放行 UDP 443**。QUIC 没有退路：UDP 被拦截时，
  客户端会改用 HTTP/2，而且不会告诉你。
- 一个支持 HTTP/3 的客户端。大多数发行版自带的 `curl` 并不支持——硬要使用时，它会明确告诉你：

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 开启 HTTP/3

```caddyfile
{
    email bonjour@pingclair.com
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

站点运行时在主机上实测：

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

从列表中去掉 `h3`，这个监听就会消失；这个列表就是开关
（[TLS 能调什么](/zh-CN/guides/tls-tuning/#-提供哪些协议)）。不写 `protocols` 行时，HTTP/3 保持开启。

`tls` 块也接受一个按站点设置的开关：

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

⚠️ 在 v0.2.0-rc.3 中，`http3 off` 会被接受但不起任何作用：该站点仍然通过 QUIC 提供。
**下一版本**：它会让该站点不走 QUIC，而监听继续为其他站点服务，该站点的响应也不再在 `Alt-Svc`
中宣告 HTTP/3。

## ✅ 证明客户端用上了它

证据来自客户端。任何用 ngtcp2 或 quiche 构建的 curl 都可以；在 curl 不支持 HTTP/3 的主机上，
用容器获取一个是最快的办法：

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

`--network host` 让容器直接使用主机的网络。没有它，请求可能要经过一个会拦截 QUIC 的网络命名空间。

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

第一行就是答案：状态行写的是 `HTTP/3`，而不是 `HTTP/2`。用 `--http2` 和 `--http1.1`
请求同一个 URL，会看到另外两种协议，这就确认了客户端没有回退。

没有容器可用时，如果系统的 OpenSSL 是 3.5 或更新的版本，可以用它检查 QUIC 握手：

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` 加上验证通过的证书链，证明 QUIC 监听会用客户端信任的证书为该域名响应。
它不能证明完整的 HTTP/3 请求可以正常工作；那要靠 curl 的检查。

## 🧭 HTTP/3 上有什么不同

HTTP/3 与 HTTP/1.1、HTTP/2 共用策略代码，所以路由、匹配器、头部、限流、FastCGI 和访问日志的行为都相同。
差异只出现在 HTTP/3 无法承载某些内容的地方：

| 方面 | 在 HTTP/3 上 |
| --- | --- |
| 声明了的请求 trailers | 不转发：响应提交前返回 `501`，之后则重置流。 |
| 上游响应 trailers | `502`。 |
| `CONNECT` | Pingclair 不建立隧道。**下一版本**：返回带 `Allow` 的 `405`，与 HTTP/1.1 和 HTTP/2 上的响应相同。 |

如果源站前面有 CDN，HTTP/3 由 CDN 自己终结，它与源站之间使用 HTTP/1.1 或 HTTP/2。
这时这里的监听无法反映访问者浏览器用的是什么协议；请改为检查 CDN 自身的 HTTP/3 设置。

## ⚠️ 出问题时

- **`option --http3: the installed libcurl version doesn't support this`。** 客户端不支持 HTTP/3；
  像上面那样使用容器。
- **`curl --http3` 卡住或超时。** UDP 443 在某处被拦截了。先检查云服务商的防火墙或安全组，再检查主机的。
- **主机上没有 UDP 监听。** `servers` 的协议列表中缺少 `h3`，或者正在运行的并不是你编辑的那个文件
  （[重载意味着什么](/zh-CN/start/service/#-重载意味着什么)）。
- **HTTP/3 在本地可用，从外部却不行。** 客户端所在的网络拦截了 UDP 443，这在企业和酒店网络中很常见；
  浏览器会悄悄回退。
- **设置了 `http3 off` 的站点仍然通过 HTTP/3 响应。** 在 v0.2.0-rc.3 中该选项不起作用；
  如果任何站点都不允许使用 HTTP/3，请从全局列表中去掉 `h3`。

## 🧭 下一步

- [TLS 能调什么](/zh-CN/guides/tls-tuning/)：协议列表、证书和客户端证书。
- [项目状态](/zh-CN/project/status/)：本版本支持什么、拒绝什么、已知有哪些问题。
- [`tls`](/zh-CN/reference/directives/#tls)：`http3` 选项所在的上下文。
