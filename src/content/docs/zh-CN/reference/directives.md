---
title: 指令
h1_emoji: '🧾'
description: 本文档涵盖的 directive 的语法、默认值与适用范围。
---

每一条列出语法、未设置时的默认值，以及可以出现的位置。版本标注（说明 directive 从哪个版本引入的 `Since:` 行）目前尚未公布。

📖 本页涵盖的是一组起始子集。已被接受但尚未记录于此的 directive 仍会由 `pingclair validate` 验证；服务器未实现的 directive 会按名字拒绝，而不是静默接受。

## encode

```text
Syntax:   encode <format> [<format> ...]
Default:  no compression
Context:  site block
```

压缩响应。参数按偏好顺序排列，因此会采用客户端可接受的第一种格式。支持 `zstd` 与 `gzip`。

指定 Brotli 会是编译错误，而不是静默降级为 gzip：代理没有流式 Brotli 编码器，该选项无法被兑现。

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<root>] [browse]
          file_server [<root>] {
              root                  <path>
              index                 <filenames...>
              browse {
                  file_limit        <number>
              }
              compress              [off|false]
              precompressed         <formats...>
              hide                  <paths...>
              status                <code>
              pass_thru
              disable_canonical_uris
              etag_file_extensions  <extensions...>
          }
Default:  disabled
Context:  site block
```

从磁盘提供文件，包含 MIME 类型判断、范围请求，以及 ETag 与 `Last-Modified` 校验。可选参数只设置这个 directive 自己的根目录；省略时使用 `root` 设定的站点根目录。

`browse` 打开目录列表，`file_limit` 决定列表最多显示多少条——名字和位置都沿用 upstream。列表模板、`reveal_symlinks`、`sort` 会被指名拒绝，而不是默默忽略：你写的选项不会无声消失。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> <value>
          header [<matcher>] {
              <field> <value>      # set
              +<field> <value>     # append
              -<field>             # remove
              set <field> <value>  # set, spelled explicitly
          }
Default:  none
Context:  site block
```

新增、替换或移除响应头。直接写字段名代表设置；在字段前加 `+` 代表追加，加 `-` 代表移除。

```caddyfile
example.com {
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -X-Powered-By
    }
}
```

## log

```text
Syntax:   log [<name>] { <options> }
Default:  no access sink
Context:  site block, global options
```

配置访问日志的输出目标。单独的 `log` 启用该站点的默认输出；`log <name> { ... }` 配置命名 logger，而不带块的 `log <name>` 则引用在 global options 中声明的通道。

块选项包含输出目标与格式（`output`、`format`）、`hostnames` 选择器、`include` 与 `exclude` 过滤、`sampling`，以及文件轮转设置（`mode`、`dir_mode`、`roll_*`）。

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

记录会先批量累积再写出；跟不上速度的输出目标会丢弃记录，并计入 `pingclair_access_log_dropped_total`。把每个请求都写进系统 journal，也必须承担 journal 接收端的成本。

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] { ... }
Default:  none
Context:  site block
```

把请求转发到一个或多个上游。默认的负载均衡策略是 round robin。主机名上游会按 `dns_refresh` 设定的间隔重新解析，因此重启并拿到新地址的后端不需要人工介入；解析失败时会保留先前的地址继续参与轮转。

```caddyfile
:80 :8080 {
    reverse_proxy {
        lb_policy least_conn
        to 10.0.0.1:8080 {
            weight 3
        }
        to 10.0.0.2:8080
        to 10.0.0.3:8080 {
            backup
        }
        health_check {
            path /health
            interval 5s
            timeout 2s
            status 200 204
            consecutive_failure 3
            consecutive_success 2
        }
    }
}
```

主动健康检查带外运行，因此失效的后端会在使用者请求到达之前退出轮转，并在通过设定的成功探测次数后重新加入。`backup` 上游只会在主要上游全部不可用时才被使用。

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block
```

设置站点根目录。`file_server` 可以自带根目录，但在这里设置，才能让文件服务器与其他处理文件的 directive 对同一个位置有一致的认识。

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls <mode>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

控制证书的获取方式。

| 模式 | 行为 |
| --- | --- |
| `tls auto` | 通过 ACME 申请公开证书并自动续期。 |
| `tls internal` | 由常驻的本地证书颁发机构签发。根证书位于 `$PINGCLAIR_TLS_STORE/internal/root.crt`，客户端必须信任它。 |
| `tls { cert ...; key ... }` | 使用块中指定的证书与密钥文件。 |

块形式也能用 `http3` 启用 HTTP/3，并支持以 `dns cloudflare <token>` 进行 DNS-01 签发，这是唯一实现的 DNS 服务商。指定其他服务商会在启动时被拒绝，而不是被接受后忽略，因为 DNS-01 正是泛域名证书可行的前提。

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
        http3
    }
    reverse_proxy localhost:3000
}
```

## 🌍 Global options

Global options 写在文件最上方、没有名称的块中。

| 选项 | 语法 | 说明 |
| --- | --- | --- |
| `admin` | `admin <address> [<token>]` | Admin API listener。未提供 token 时只接受回环连接。 |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 控制自动 HTTPS 与 80 端口跳转。 |
| `dns_refresh` | `dns_refresh <duration>` | 主机名上游的重新解析间隔。`off` 会固定在启动时解析到的地址。 |
| `email` | `email <address>` | ACME 签发使用的账户邮箱。 |
| `trusted_proxies` | `trusted_proxies <cidr> [<cidr> ...]` | 允许声明客户端身份请求头的对端。变更后需要重启。 |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
