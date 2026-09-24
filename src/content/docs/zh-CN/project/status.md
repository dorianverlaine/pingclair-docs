---
title: 项目状态
h1_emoji: '📌'
description: 当前版本支持什么、按设计拒绝什么、有哪些已知的限制与缺陷，以及下一版本会有哪些变化。
---

本页在你部署之前回答一个问题：当前版本能否满足你的需要，它的边界在哪里。
本页描述的是最新发布的版本 **v0.2.0-rc.3**。

## 📌 当前版本是候选版本

当前版本是 **v0.2.0-rc.3**。它的[发布说明](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)
列出了变更内容，以及打标签时已知的缺陷。

`v0.1.x` 系列已停止维护，不再接收任何修复、向后移植或安全公告。请从它升级：`v0.1.x` 会解析
Admin API 的 `api_key` 字段却从不读取它，所以它的 Admin API 实际上不对任何人做身份验证。

## ✅ 当前版本支持什么

| 方面 | 支持情况 |
| --- | --- |
| 协议 | 用一份配置同时提供 TCP 上的 HTTP/1.1 和 HTTP/2，以及基于 QUIC 的 HTTP/3。 |
| TLS | 通过 ACME 自动获取公网证书、持久化的内部证书颁发机构，以及你自己提供的证书文件。 |
| 静态文件 | 文件服务，支持 `zstd` 和 `gzip` 压缩、范围请求和条件请求。 |
| 反向代理 | 多个上游、多种负载均衡策略、主动健康检查和备用上游。 |
| FastCGI | HTTP/1.1 和 HTTP/2 上的 `php_fastcgi`。 |
| 限流 | 按匹配器进行精确的本地限流。 |
| 可观测性 | 带轮转的访问日志，以及 Prometheus 指标。 |
| 管理 | 用于查看状态和重载配置的 Admin API。 |

## 🛡️ 服务器按设计拒绝的名称

Caddyfile 格式定义的名称比 Pingclair 实现的要多。服务器无法兑现的名称会在文件加载时被拒绝，
并给出缺失功能的名称。包含这类名称的配置无法启动。读者问得最多的有：

- `map`、`invoke` 和 `tracing` 指令；
- `storage` 选项，因为证书和状态只保存在本地磁盘上；
- `on_demand_tls` 和 `ocsp_stapling` 选项；
- `handle_errors`；自定义错误页面请改用 `error_page`；
- `encode br`，因为没有流式的 Brotli 编码器。

完整列表在服务器代码仓库的 README 中。那里有一项测试：解析器拒绝了 README 未提及的名称时，测试就会失败，
所以这份列表不会落后于代码。

## ⚠️ 已知限制

- **证书存储是本地的。** 多个实例无法共享同一个证书存储，因为存储就是磁盘上的一个目录。
- **DNS-01 在本版本中无法完成。** 对于 Cloudflare，`tls { dns cloudflare <token> }` 和全局选项
  `acme_dns` 都会被接受，其他任何提供商都会被点名拒绝。但在 v0.2.0-rc.3 中，每个 DNS-01 订单都以
  `Invalid` 告终，因为 TXT 记录中的值是错误的。修复在 `main` 上
  （[HTTPS](/zh-CN/start/https/#-dns-01-与通配符证书)）。
- **HTTP/3 不支持 trailers，也不支持隧道。** 声明了 trailers 的请求在所有协议上都会被拒绝，
  HTTP/3 会重置 `CONNECT`（[架构](/zh-CN/concepts/architecture/#-各协议的差异)）。
- **高负载下 WebSocket 升级会间歇性失败**，在繁忙的机器上大约为 10-15%。原因是上游
  `pingora-proxy` crate 中的竞态条件（[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)），
  空闲的机器很少能复现。

## 🔁 下一版本有哪些变化

下列变化已在 `main` 上，但不在 v0.2.0-rc.3 中。其中有几项会在升级后改变行为；
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
在 Unreleased 下逐一列出，并附有升级说明。

- **路由顺序遵循 Caddy。** 由指令顺序而不是最具体的路径决定哪条路由响应
  （[配置模型](/zh-CN/concepts/configuration/#-由哪条路由响应请求)）。
- **只在 `encode` 要求的地方压缩。** 没有 `encode` 的站点以未压缩的形式提供文件。
- **不再有默认的请求体大小上限。** 默认的 1 MiB 上限已经取消；如果你依赖它，请设置
  `request_body { max_size … }`。
- **`remote_ip` 与 `client_ip` 不再相同。** `remote_ip` 匹配连接的对端，`client_ip`
  匹配应用 `trusted_proxies` 之后的客户端。要在 Pingclairfile 中屏蔽客户端，请匹配 `client_ip` 并使用
  `abort`；`blocked_ips` 只存在于 JSON 配置中。
- **`CONNECT` 和 `TRACE` 在所有协议上都得到带 `Allow` 头部的 `405`。**
- **HSTS 跟随连接。** `Strict-Transport-Security` 只在加密的响应上发送，Pingclairfile 通过
  `header Strict-Transport-Security "max-age=…"` 开启它。
- **停止是平滑的。** `SIGTERM` 让正在处理的请求在 `grace_period`（默认 30 秒）内完成。
- **admin 端口或 HTTP/3 端口被占用时，启动会中止**，而不只是记录一条日志。
- **网关错误会说明出自谁手。** Pingclair 生成的 `502` 或 `504` 带有 `Proxy-Status` 头部。
- **DNS-01 可以正常工作**，通配符站点只申请一张通配符证书。
- **接受 `storage file_system <path>` 和 `ocsp_stapling off`。**
- **内部证书颁发机构改用 Caddy 的布局。** 旧的颁发机构不会迁移：会创建新的根证书，客户端必须重新信任它。

## 🐛 报告缺陷

请在 [issue 跟踪器](https://github.com/dorianverlaine/pingclair/issues)上报告缺陷和文档错误。
带有私密报告渠道的安全策略尚未发布。

## 📚 相关页面

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)：各版本之间的变化。
- [性能测量](/zh-CN/project/benchmarks/)：测量条件与结果。
- [架构](/zh-CN/concepts/architecture/)：组件与请求路径。
