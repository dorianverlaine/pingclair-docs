---
title: TLS 能调什么
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair 遵从哪些 TLS 与协议设置、点名拒绝哪些，以及如何要求客户端证书、如何在主机之间迁移证书存储。
---

Pingclair 有意只提供很少的 TLS 设置：域名会自动获得证书，本页的设置决定获得的方式。
Caddy 接受的其他 TLS 设置都会被点名拒绝，而不是被忽略，所以配置永远不会悄悄地少做它声称要做的事。
下面的每个结果都是在真实主机上测得的。

📌 本页描述的是最新发布的版本 **v0.2.0-rc.3**。仅存在于服务器 `main` 分支上的变化标记为 **下一版本**。

## 🧾 开始之前

- 已安装并运行 Pingclair（[安装](/zh-CN/start/install/)）。
- 涉及证书颁发机构的部分，需要一个解析到该主机的域名；实验机也可以使用内部证书颁发机构
  （[HTTPS](/zh-CN/start/https/)）。

## 🌐 提供哪些协议

协议集合写在全局 `servers` 块中：

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
| `protocols h1 h2` | 0——没有 HTTP/3 |
| `protocols h1 h2 h3` | 1——HTTP/3 已开启 |

⚠️ 这个列表决定的是 **HTTP/3**，也只决定 HTTP/3。只列出 `h1` 并不能关闭 HTTP/2：写成
`protocols h1` 时，提供了 `h2` 的客户端仍然协商到了 HTTP/2。服务器从列表中读取的唯一信息是其中有没有
`h3`，所以没有任何设置可以关闭 HTTP/2。不写 `protocols` 行时，HTTP/3 是开启的。

按站点设置的 `http3 off` 本意是让某一个域名退出 HTTP/3，而 QUIC 监听继续为其他域名服务：

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

⚠️ 在 v0.2.0-rc.3 中，这个选项会被接受但不起任何作用。**下一版本**：它会生效，该站点也不再在
`Alt-Svc` 中宣告 HTTP/3。

## 🏛️ 证书来源

三种来源，都在 [HTTPS 页面](/zh-CN/start/https/)上演示过：

| 来源 | 配置 | 用途 |
| --- | --- | --- |
| Let's Encrypt | 直接写公网域名 | 公网域名，在后台续期。 |
| 内部证书颁发机构 | `tls internal` | 实验环境域名、私有源站、隧道。 |
| 你自己的文件 | `tls { cert … key … }` | 在别处签发的证书。 |

续期在后台进行。全局选项 `renewal_window_ratio` 以每张证书有效期的比例，设定续期提前多久开始。

## 🔐 客户端证书

`client_auth` 让服务器向客户端索要证书。先用 `openssl` 创建一个小型证书颁发机构和一张客户端证书，
再把站点指向该颁发机构的证书**文件**：

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

实测：不带客户端证书的请求在握手阶段失败，同样的请求加上 `--cert client.crt --key client.key`
则返回 `200`。

可用的模式有 `request`、`require`、`verify_if_given` 和 `require_and_verify`。拼错的模式会被拒绝，
并列出完整的列表 `(expected request, require, verify_if_given or require_and_verify)`。

⚠️ `trusted_ca_cert` 接受证书本身，以 base64 编码写在一行里；`trusted_ca_cert_file` 接受的是路径。
把路径传给前者可以通过编译，但会在启动时以
`trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` 失败——
45 就是 `-----BEGIN` 中的 `-`。该文件还必须能被 `pingclair` 用户读取。

## 📦 迁移证书存储

存储中保存着已签发的证书、ACME 账户和内部证书颁发机构。对于软件包安装，它位于
`/var/lib/pingclair/.local/share/pingclair`，即服务账户主目录下的数据目录。以其他用户身份运行的命令
会查找该用户自己的数据目录，所以示例中设置了 `PINGCLAIR_TLS_STORE`；没有它，root 会使用
`/root/.local/share/pingclair`。`storage-export` 和 `storage-import` 用于迁移存储：

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

这次运行中有三处细节。无论文件名是什么，归档都是**普通的 tar**，以 `600` 权限写入，
所以读回它需要 root 权限。导入会恢复归档中记录的所有权。存储中还有 `autosave.json`，
即 Admin API 最近一次应用的配置，所以导入也会恢复它。

**下一版本**：内部证书颁发机构会像 Caddy 那样存放在 `pki/authorities/local/` 下。
旧的 `internal/` 目录不会迁移：服务器会创建新的颁发机构，每个客户端都必须重新信任新的根证书
（`pingclair trust`）。另外，还可以用全局选项 `storage file_system <path>` 在配置中指定存储位置。

如果之后服务以 `Internal CA I/O error: Permission denied` 拒绝启动，说明存储中的文件对服务账户不可写；
执行 `sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair`
即可修复，站点也会恢复响应。

## 🚫 哪些不能调

Pingclair 能识别以下 Caddy 设置，并会拒绝它们，所以文件永远不会在某个设置被悄悄丢弃的情况下运行：

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

因此，加密套件、曲线、ALPN 列表和按需签发都由构建决定，而不是由配置决定。
OCSP stapling 也没有实现。如果其中某项对你很重要，那是一个功能请求，而不是配置错误。

## ⚠️ 出问题时

- **`client_auth` 以 `not valid base64` 拒绝启动。** 把路径传给了 `trusted_ca_cert`；
  接受文件的写法是 `trusted_ca_cert_file`。
- **持有有效证书的客户端被拒绝。** 检查签发它的 CA 是否就是 `trusted_ca_cert_file` 中的那个，
  以及证书是否已过期。
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand` 导致文件被拒绝。**
  它们尚未实现；见上一节。
- **写了 `protocols h1 h2` 后 HTTP/3 仍在运行。** 这不应该发生，因为 HTTP/3 正是由这个列表控制的。
  如果 UDP 443 仍在监听，说明正在运行的文件不是你编辑的那个
  （[重载意味着什么](/zh-CN/start/service/#-重载意味着什么)）。
- **迁移存储后服务无法启动。** 是所有权问题，处理方法同上。

## 🧭 下一步

- [HTTPS](/zh-CN/start/https/)：获取证书的四种方式，以及各自确切的日志行。
- [HTTP/3](/zh-CN/guides/http3/)：开启它，并证明客户端用上了它。
- [`tls`](/zh-CN/reference/directives/#tls)：指令参考。
