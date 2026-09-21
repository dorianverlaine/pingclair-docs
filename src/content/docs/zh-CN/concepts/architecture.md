---
title: 架构
h1_emoji: '🏗️'
description: 服务器的组成组件，以及请求经过它们的路径。
---

## 🧱 组成组件

Pingclair 是一个 Cargo workspace。实际运行的服务器是 `pingclair` 二进制，它链接下列 crate。

| Crate | 职责 |
| --- | --- |
| `pingclair` | 命令行入口：参数解析、日志、启动流程与服务封装。 |
| `pingclair-config` | 配置编译器：词法分析、解析并检查 Pingclairfile 的语义。 |
| `pingclair-proxy` | 基于 Pingora 的 HTTP/1.1 与 HTTP/2 代理、基于 quiche 的 HTTP/3 listener、负载均衡，以及共用的请求策略层。 |
| `pingclair-static` | 静态文件服务：文件读取、MIME 类型、范围请求与流式传输。 |
| `pingclair-tls` | 证书管理：手动证书、常驻的内部证书颁发机构，以及自动 ACME 签发。 |
| `pingclair-api` | 用于查看状态并重新加载配置的 Admin API。 |
| `pingclair-core` | 上述 crate 共用的数据结构与服务器生命周期。 |

## 🚦 请求的路径

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

两种传输最终都汇入同一个策略层，因此路由、请求头处理、限流与访问日志在 HTTP/1.1、HTTP/2、HTTP/3 上的行为一致。只有在协议本身要求不同的时候，两种传输才会出现差异。

## 🌊 请求处理特性

- **Body 以流式处理。** 请求与响应的 body 以有界块流经代理。压缩、中间件与代理都不会缓冲完整的 body，因此大文件上传或缓慢的读取端不会占用与 body 大小成正比的内存。
- **上游连接会被复用。** 与后端之间的 keepalive 连接会被复用。主机名上游会按 `dns_refresh` 设定的间隔重新解析，因此重启并拿到新地址的容器不需要人工介入就能跟上。
- **运行时状态在请求期间不可变。** 请求读取的是已发布的 snapshot；重新加载会发布新的 snapshot，而不是修改正在使用的那一份。

## 🌐 各协议的差异

部分行为因协议而异，这是刻意的设计。这里先列出，而不是让使用者事后才发现：

| 领域 | 行为 |
| --- | --- |
| Trailers | 请求中声明的 trailer 不会被转发。服务器会在响应提交前返回 `501`、对已提交的 HTTP/3 流发出 reset，并在上游声明响应 trailer 时返回 `502`。 |
| CONNECT | 在 HTTP/3 上，`CONNECT` 与 extended `CONNECT` 会返回 `501`，直到 tunnel 支持被实现。 |
| FastCGI | `php_fastcgi` 支持 HTTP/1.1 与 HTTP/2。需要 FastCGI 的路由在 HTTP/3 上会返回 `501`，直到该路径拥有自己的 FastCGI 客户端。 |

## ⚠️ 已知缺陷

WebSocket 升级在负载下会间歇性失败：在繁忙的机器上约有 10-15% 的升级失败。原因是上游 `pingora-proxy` crate 的竞态，而不是 Pingclair 自己的升级处理；并且在空闲的开发机上完全看不到，所以必须写在这里。上游 issue：[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)。
