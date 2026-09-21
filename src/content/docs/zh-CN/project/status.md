---
title: 项目状态
description: 当前版本支持什么、拒绝什么，以及已知的缺陷。
---

## 📌 发布版本

当前版本是 **v0.2.0-rc.3**，属于 release candidate。它的[发布说明](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)列出了变更内容，以及打标签时已知的缺陷。

`v0.1.x` 系列已不再维护：没有修复、没有反向移植，也没有安全公告。此外，`v0.1.x` 会解析 Admin API 的 `api_key` 字段却从不读取，等于该字段没有提供任何保护。

## ✅ 支持的项目

| 领域 | 状态 |
| --- | --- |
| 协议 | 在 TCP 上提供 HTTP/1.1 与 HTTP/2，在 QUIC 上提供 HTTP/3，来自同一份配置。 |
| TLS | 通过 ACME 自动申请公开证书、常驻的内部证书颁发机构，以及手动的证书与密钥文件。 |
| 静态文件 | 文件服务，支持 `zstd` 与 `gzip` 压缩、范围请求与条件请求。 |
| 反向代理 | 多个上游、多种负载均衡策略、主动健康检查与备用上游。 |
| FastCGI | 在 HTTP/1.1 与 HTTP/2 上支持 `php_fastcgi`。 |
| 限流 | 按 matcher 的精确本地限流。 |
| 可观测性 | 支持轮转的访问日志，以及 Prometheus 指标。 |
| 管理 | 用于查看状态并重新加载配置的 Admin API。 |

## 🛡️ 刻意拒绝的配置

配置格式定义的名字多于服务器实现的数量。服务器无法兑现的名字，会在加载时按名字拒绝，并附带“功能不存在”的说明。读者最常问到的例子：

- `map`、`invoke` 与 `tracing` 等 directive；
- `storage` 选项，因为证书与状态只保存在本机磁盘；
- `on_demand_tls` 与 OCSP stapling 相关选项；
- `handle_errors`，其配置类型存在但不会执行任何工作；
- `encode br`，因为没有流式 Brotli 编码器。

完整清单维护在服务器仓库的 README，并由一个测试把关：当解析器拒绝了清单未提及的名字时，测试会失败。

## ⚠️ 已知限制

- **证书存储只在本机。** 多个实例无法共用同一份证书存储，因为该存储是磁盘上的目录。
- **DNS-01 只有一个服务商。** `tls { dns cloudflare <token> }` 与全局的 `acme_dns` 只实现了 Cloudflare。其他服务商名字会在启动时被拒绝，而不是被接受后忽略。
- **HTTP/3 的 trailer 与 tunnel。** 请求中声明的 trailer 不会被转发（响应提交前返回 `501`，提交后对流发出 reset），上游 trailer 会产生 `502`，而 `CONNECT` 会返回 `501`。
- **HTTP/3 上的 FastCGI 会返回 `501`**，直到该路径拥有自己的 FastCGI 客户端。
- **WebSocket 升级在负载下会间歇性失败**，在繁忙的机器上约 10-15%。原因是上游 `pingora-proxy` crate 的竞态（[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)），不是 Pingclair 自己的处理；空闲的机器无法复现。

## 🐛 报告

缺陷与文档错误请通过 [issue tracker](https://github.com/dorianverlaine/pingclair/issues) 报告。指定私有报告渠道的安全策略目前尚未公布。

## 📚 相关文档

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)：版本之间变更了什么。
- [性能测量](/zh-CN/project/benchmarks/)：测量条件与结果。
- [架构](/zh-CN/concepts/architecture/)：组成组件与请求路径。
