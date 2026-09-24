---
title: 架构
h1_emoji: '🏗️'
description: 构成服务器的各个 crate、请求在其中经过的路径，以及 HTTP/1.1、HTTP/2 与 HTTP/3 行为不同的地方。
---

一台支持三个 HTTP 版本的 Web 服务器有两种出错方式：每个协议各自长出一套规则，
或者某个协议悄悄漏掉了其他协议都遵守的规则。Pingclair 的做法是让每种传输只负责搬运字节，
所有请求都经过同一个共享的策略层，从而同时避开这两种问题。本页介绍各个组件、请求经过的路径，
以及协议之间仍然存在差异的少数地方。本页描述的是 **v0.2.0-rc.3**。

## 🧱 服务器是由几个 crate 构建的单个二进制文件

Pingclair 是一个 Cargo workspace。`pingclair` 二进制文件链接下列 crate，每个 crate 只负责一件事。

| Crate | 职责 |
| --- | --- |
| `pingclair` | 命令行入口：参数解析、日志、启动、关闭与重载。 |
| `pingclair-config` | 配置编译器：读取 Pingclairfile，进行检查，生成服务器运行的配置。 |
| `pingclair-proxy` | 基于 Pingora 的 HTTP/1.1 与 HTTP/2、基于 quiche 的 HTTP/3、负载均衡，以及共享的请求策略层。 |
| `pingclair-static` | 静态文件服务：文件读取、MIME 类型、范围请求与条件请求，以及流式传输。 |
| `pingclair-fastcgi` | `php_fastcgi` 用来连接 PHP-FPM 的 FastCGI 客户端。 |
| `pingclair-tls` | 证书管理：证书文件、内部证书颁发机构和 ACME 签发。 |
| `pingclair-api` | 用于查看状态和重载配置的 Admin API。 |
| `pingclair-core` | 上述 crate 共享的数据结构与生命周期。 |

## 🚦 每个请求都经过同一个策略层

```text
client
  |
  |  TLS with ALPN, or QUIC
  v
listener             HTTP/1.1 and HTTP/2 on TCP, HTTP/3 on UDP
  |
  v
transport adapter    Pingora ProxyHttp for TCP, tokio-quiche for QUIC
  |
  v
policy layer         routing, matchers, headers, rate limits, access log
  |
  v
handler              file server | reverse proxy | FastCGI | static response
  |
  v
upstream or disk
```

传输适配器把协议帧转换成请求，然后交给下一层。路由、头部规则、限流和访问日志只在策略层实现一次，
所以它们在 HTTP/1.1、HTTP/2 和 HTTP/3 上的行为完全一致。两种传输连接上游时也使用同一个连接器，
因此连接池、上游 TLS 和超时设置同样是共享的。

## 🌊 对每个请求都成立的事

- **请求体和响应体以流式传输。** 它们以有界的分块在服务器中流动。压缩和反向代理都不会先收集完整的请求体或响应体，
  所以大文件上传或读取缓慢的客户端不会让内存占用随请求体大小增长。
- **上游连接会被复用。** 到后端的 keepalive 连接进入连接池。以主机名指定的上游会按照
  `dns_refresh` 设定的间隔重新解析，因此后端容器换了地址重启后，服务器会自动跟上，无需运维介入。
- **请求运行期间，配置只读不改。** 每个请求读取的是已发布的编译后配置快照。
  重载会构建新快照并替换进去；已在处理中的请求继续使用旧快照完成。

## 🌐 各协议的差异

少数行为因协议而异。在这里列出，是为了不让任何人在生产环境中才发现它们。

| 方面 | v0.2.0-rc.3 中的行为 |
| --- | --- |
| Trailers | 任何协议都不转发请求 trailers。声明了 trailers 的请求会在响应开始前得到 `501`；如果 HTTP/3 流的响应已经开始，则改为重置该流。声明了 trailers 的上游响应会得到 `502`。 |
| `CONNECT` | Pingclair 不建立隧道。HTTP/1.1 和 HTTP/2 返回 `405`。HTTP/3 把标准的 `CONNECT` 请求当作格式错误而重置，对同时携带 `:scheme` 和 `:path` 的请求返回 `501`。 |
| FastCGI | `php_fastcgi` 在所有协议上都可用，包括 HTTP/3。 |

📌 **下一版本**：在 `main` 上，`CONNECT` 在所有协议上都返回带 `Allow` 头部的 `405`，`TRACE` 也一样。
这些变化不在 v0.2.0-rc.3 中；
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) 把它们记录在 Unreleased 下。

## ⚠️ 高负载下 WebSocket 升级会间歇性失败

Pingclair 可以反向代理 WebSocket，但机器繁忙时大约有 10-15% 的升级会失败。从外部看，
失败的升级表现为连接在 `101 Switching Protocols` 响应之后立即被关闭。原因是上游
`pingora-proxy` crate 中的竞态条件，而不是 Pingclair 的升级处理，任何配置都无法绕开。
空闲的开发机很少能复现它，所以在这里明确写出。上游 issue：
[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)。

## 🧭 相关页面

- [配置模型](/zh-CN/concepts/configuration/)：Pingclairfile 如何变成上文所说的快照。
- [项目状态](/zh-CN/project/status/)：当前版本支持什么、拒绝什么。
