---
title: TLS 能调什么
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair 尊重哪些 TLS 与协议设置、按名字拒绝哪些、如何要求客户端证书，以及在主机之间迁移证书存储。
---

Pingclair 的 TLS 面刻意做得很小：域名自动拿到证书，决定这件事怎么发生的设置就是
本页记录的这些。Caddy 接受的其他写法不会被静默忽略，而是按名字拒绝，所以配置
永远不会比它写着的做得更少。本页把真机上量出来的「确实生效」与「确实不生效」
放在一起。

## 🧾 开始之前

- 已经安装并运行 Pingclair（[安装](/zh-CN/start/install/)）。
- 涉及证书颁发机构的部分需要一个解析到本机的域名，实验机则用内部机构
  （[HTTPS](/zh-CN/start/https/)）。

## 🌐 提供哪些协议

协议集合放在全局 `servers` 块里：

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

用 `sudo ss -lun | grep ':443 '` 实测：

| 配置 | UDP 443 监听 |
| --- | --- |
| `protocols h1 h2` | 0 —— 没有 HTTP/3 |
| `protocols h1 h2 h3` | 1 —— 启用 HTTP/3 |

⚠️ 这个列表决定的是 **HTTP/3**，仅此而已。只写 `h1` 并不会拿走 HTTP/2：在
`protocols h1` 下，一个在 ALPN 里提供 `h2` 的客户端仍然协商到了 HTTP/2。编译器
只是把这个列表映射到 HTTP/3 开关上（`config.global.http3 = protocols.contains(H3)`），
没有按域名关闭 HTTP/2 的设置。

按站点看，`http3 off` 会把该域名移出 HTTP/3，而不停止 QUIC 监听器：

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

## 🏛️ 证书来源

三种来源，[HTTPS 页](/zh-CN/start/https/) 都演示过：

| 来源 | 配置 | 用途 |
| --- | --- | --- |
| Let's Encrypt | 裸的公开域名 | 公开域名，后台续期。 |
| 内部机构 | `tls internal` | 实验域名、私有源站、隧道。 |
| 自己的文件 | `tls { cert … key … }` | 在别处签发的证书。 |

续期自行运行；全局选项里的 `renewal_window_ratio` 用每张证书寿命的比例决定提前
多久开始。

## 🔐 客户端证书

`client_auth` 要求客户端出示证书。用 `openssl` 生成一个小型机构与客户端证书，
然后让站点指向机构的**文件**：

```caddyfile
https://internal.test {
    tls {
        internal
        client_auth {
            mode require_and_verify
            trusted_ca_cert_file /etc/pingclair/client-ca.crt
        }
    }
    file_server /srv/site
}
```

实测：不带客户端证书的请求在握手阶段失败；带上
`--cert client.crt --key client.key` 的同一个请求返回 `200`。

模式有 `request`、`require`、`verify_if_given`、`require_and_verify`，没有回退：
拼错会被连同完整列表
`(expected request, require, verify_if_given or require_and_verify)` 一起拒绝。

⚠️ `trusted_ca_cert` 收的是**内联**证书，`trusted_ca_cert_file` 收的是路径。把路径
给前者能编译，但启动时会以
`trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` 失败
（`-----BEGIN` 里的那个 `-`）。文件还必须能被 `pingclair` 用户读取。

## 📦 迁移证书存储

存储里保存着已签发的证书、ACME 账号与内部机构，位置是
`/var/lib/pingclair/.local/share/pingclair`——服务账号的数据目录。以别的用户
运行时才需要 `PINGCLAIR_TLS_STORE` 指定它（下面例子里加前缀就是这个原因，
root 的默认值会是 `/root/.local/share/pingclair`）。
`storage-export` 与 `storage-import` 负责搬运：

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/.local/share/pingclair
sudo mkdir -p /var/lib/pingclair/.local/share/pingclair && sudo chown pingclair:pingclair /var/lib/pingclair/.local/share/pingclair
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/.local/share/pingclair
```

运行中发现的三个细节。归档不管叫什么名字都是**纯 tar**，而且以 `600` 权限写出，
所以读回来需要 root。导入会恢复归档里记录的属主。存储里还有 `autosave.json`
（Admin API 最后应用的配置），导入会把它一起带回来。

如果之后服务以 `Internal CA I/O error: Permission denied` 拒绝启动，说明存储里
的文件对服务账号不可写；`sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair`
能修好，站点随即恢复应答。

## 🚫 调不了的东西

以下是 Pingclair 认识并拒绝的 Caddy 设置，配置不会带着被静默丢弃的设置继续运行：

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

实践上这意味着：密码套件、曲线、ALPN 列表、按需签发都是构建的选择而不是配置的
选择；OCSP stapling 与 `preferred_chains` 也没有实现。如果其中某一项对你重要，
那是功能请求，不是配置错误。

## ⚠️ 出问题时

- **`client_auth` 以 `not valid base64` 拒绝启动。** 你给 `trusted_ca_cert` 传了
  路径；文件形式的写法是 `trusted_ca_cert_file`。
- **持有有效证书的客户端被拒绝。** 检查签发它的机构是否就是
  `trusted_ca_cert_file` 里的那个，以及证书是否过期。
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand` 拒绝该文件。**
  它们没有实现；见上一节。
- **`protocols h1 h2` 之后 HTTP/3 还在跑。** 不该如此 —— 控制它的就是那个列表。
  如果 UDP 443 还在监听，说明正在运行的不是你编辑的那个文件，见
  [重载意味着什么](/zh-CN/start/service/#-重载意味着什么)。
- **迁移存储后服务起不来。** 就是上面的属主问题。

## 🧭 下一步

- [HTTPS](/zh-CN/start/https/)：拿到证书的四种方式，以及它们确切的日志行。
- [HTTP/3](/zh-CN/guides/http3/)：开启它，并证明客户端真的用了它。
- [`tls`](/zh-CN/reference/directives/#tls)：指令参考。
