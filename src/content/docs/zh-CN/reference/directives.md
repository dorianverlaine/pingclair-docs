---
title: 指令
h1_emoji: '🧾'
description: 本参考涵盖的 Pingclairfile 指令与全局选项的语法、默认值、上下文、拒绝规则，以及与 Caddy 的差异。
---

每个条目都以固定的头部开始：语法、未写该指令时的默认行为，以及指令可以出现的位置。
随后说明指令的作用、会拒绝什么，以及与 Caddy 的不同之处。

📌 本页描述的是最新发布的版本 **v0.2.0-rc.3**。下一版本改变某项行为时，条目会在 **下一版本** 下注明；
这些行为已在服务器的 `main` 分支上，但尚未进入任何已发布的构建。

📖 本页只涵盖这门语言的一个子集。未在此列出的指令仍然会被 `pingclair validate` 检查，
而服务器尚未实现的指令会被点名拒绝，不会被接受后忽略。

## basic_auth

```text
Syntax:   basic_auth [<matcher>] [bcrypt|argon2id [<realm>]] {
              <username> <hashed_password>
              ...
          }
Default:  no authentication
Context:  site block, handle, route
```

在请求继续处理之前要求 HTTP Basic 凭据。块中的每一行是一个账户：用户名加密码哈希，绝不是密码本身。
哈希由 `pingclair hash-password` 生成（[命令行](/zh-CN/reference/command-line/#pingclair-hash-password)）。

指令行上的算法用于校验块中的每一个哈希，默认是 `bcrypt`。其他任何算法名称都会被拒绝，
没有块的 `basic_auth` 也会被拒绝。

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode off
Default:  gzip in v0.2.0-rc.3; no compression in the next release
Context:  site block
```

压缩响应。编码格式按优先顺序列出：客户端接受多种格式时，列在最前面的胜出。支持的格式是 `zstd` 和 `gzip`，
单独写 `encode` 表示 `gzip`。`encode off` 关闭该站点的压缩。

拒绝规则：

- `encode br` 在加载时被拒绝。代理没有流式的 Brotli 编码器，所以服务器不会悄悄退回到 gzip：
  `` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- 未知的格式会被拒绝，并列出有效的格式。
- 路径匹配器或命名匹配器会被拒绝，因为压缩是按站点设置的，而不是按路由。匹配一切的 `*` 匹配器可以接受。

与 Caddy 的差异：在 v0.2.0-rc.3 中，没有 `encode` 行的 Pingclairfile 站点仍然会用 gzip 压缩。
Caddy 只在 `encode` 要求的地方压缩。

**下一版本**：和 Caddy 一样，站点只在 `encode` 要求的地方压缩。依赖旧默认行为的站点必须加上
`encode gzip` 或 `encode zstd gzip`。

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse
              compress              [off|false]
              precompressed         [br|zstd|gzip ...]
              hide                  <paths...>
              status                <code>
              pass_thru
              disable_canonical_uris
              etag_file_extensions  <extensions...>
          }
Default:  disabled
Context:  site block, handle, route
```

从磁盘提供文件。它会检测 MIME 类型，响应字节范围请求，并发送 `ETag` 和 `Last-Modified`。
文件来自 `root` 设置的站点根目录，或者只给这个指令指定的根目录。

- `index` 指定目录要尝试的文件名；默认是 `index.html`。
- `browse` 为没有索引文件的目录渲染列表。
- `compress off` 让这个文件服务器在一个本来会压缩的站点上免于压缩。
- `precompressed` 在客户端接受相应编码时，提供 `app.js.gz` 这样的预压缩文件。不带参数时，顺序为 `br zstd gzip`。
- `hide` 阻止所列路径被提供。多行会累加。
- `status` 让每个文件都以这个状态码响应，用于维护页面。
- `pass_thru` 在文件不存在时把请求交给下一个处理器，而不是返回 `404`。
- `disable_canonical_uris` 停止为目录补上末尾斜杠的重定向。

拒绝规则：`fs` 会被拒绝，因为只支持本地文件系统。超出 100–599 范围的 `status` 和未知的子指令也会被拒绝。

与 Caddy 的差异：位置参数 `<root>` 是 Pingclair 新增的。在 Caddy 中，`file_server` 后面的裸路径是路径匹配器。
如果配置也要能在 Caddy 中加载，请优先使用 `root`。

**下一版本**：

- `browse` 接受选项块，`file_limit <n>` 限制列表显示的条目数。列表模板、`reveal_symlinks` 和 `sort`
  会被点名拒绝。
- `GET` 和 `HEAD` 以外的方法返回 `405`，并带 `Allow: GET, HEAD`。
- 会响应条件请求：匹配的 `If-None-Match` 或仍然有效的 `If-Modified-Since` 得到 `304`，
  不满足的 `If-Match` 或 `If-Unmodified-Since` 得到 `412`。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> [<value> [<replacement>]]
          header [<matcher>] {
              <field> <value>                  # set
              +<field> <value>                 # append
              -<field>                         # remove
              ?<field> <value>                 # set only if absent
              <field> <search> <replacement>   # regular-expression replace
              defer
          }
Default:  none
Context:  site block, handle, route
```

修改响应头部。只写字段名表示设置该头部，`+` 前缀表示追加一个值，`-` 前缀表示删除该字段。
`?` 前缀只在响应中还没有该字段时才设置。有三个参数时，第二个是正则表达式，第三个替换它匹配到的内容。

头部总是应用在最终完成的响应上，所以 `defer` 和 `>` 前缀可以接受，但不会改变任何行为。

拒绝规则：

- 同时带有参数和块的指令会被拒绝。
- 不带值的 `header X-Name` 会被拒绝。Caddy 会设置一个空值，但空的响应头部几乎总是写错了的删除操作。
- 块中的 `match` 响应匹配器会以尚未实现为由被拒绝。

⚠️ 没有 `set` 关键字。块中的 `set X-Name value` 一行会被解读为对名为 `set` 的头部做正则替换。

**下一版本**：按照 RFC 6797 的要求，`Strict-Transport-Security` 只在加密的响应上发送，
并从每个明文响应中移除。写 `header Strict-Transport-Security "max-age=…"` 就是开启 HSTS 的方式。

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
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; named channels in global options
```

写访问日志。四种形式含义各不相同：

- `log` 为站点开启默认访问日志，输出到标准输出。
- `log { … }` 配置站点的访问日志。
- `log <name> { … }` 为站点添加一个命名的日志记录器，有自己的输出。
- `log <name>` 把站点的记录发送到在全局选项中用 `log <name> { … }` 声明的同名通道。

块选项包括 `output`（`stdout`、`stderr` 或 `file <path>`）、`format`（`json` 或 `console`）、`level`、
`hostnames` 选择器、`include` 和 `exclude` 过滤器、`sampling`，以及文件轮转（`roll_size`、`roll_keep`、
`roll_keep_for`、`mode`、`dir_mode` 和其他 `roll_*` 选项）。

拒绝规则：全局通道不能使用 `hostnames`，因为它不附属于任何站点。重复声明的通道会被拒绝。

记录在写入前会先批量汇集。跟不上的输出端会丢弃记录，并在 `pingclair_access_log_dropped_total` 中计数。

**下一版本**：没有名称的全局 `log { … }` 块会被拒绝。在 v0.2.0-rc.3 中，它会被接受但不起任何作用。

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] [<upstream> ...] { ... }
Default:  none
Context:  site block, handle, route
```

把请求转发到一个或多个上游。`lb_policy` 决定请求如何在它们之间分配；在 v0.2.0-rc.3 中默认是 `round_robin`。

以主机名指定的上游会按全局选项 `dns_refresh` 设定的间隔重新解析，所以后端换了地址重启后，
无需重载就能跟上。解析失败时，之前的地址会继续留在轮换中。

主动健康检查在请求路径之外探测每个上游。失败的上游会在用户请求到达之前离开轮换，
并在达到设定次数的成功探测后重新加入。`backup` 上游只有在所有主上游都不可用时才会被使用。

拒绝规则：未知选项会以完整名称被拒绝，例如 `Unknown directive 'reverse_proxy: dial_timeout'`。
超时设置应写在 `transport http` 块中。

**下一版本**：

- 默认的 `lb_policy` 改为 `random`，这是 Caddy 的默认值。要保持现在的行为，请写 `lb_policy round_robin`。
- `lb_policy first` 总是选择第一个可用的上游。在 v0.2.0-rc.3 中它的行为与 `round_robin` 相同。
- Pingclair 自己生成的 `502` 或 `504` 会带有 `Proxy-Status: pingclair; error=…`，
  从而可以与后端发出的响应区分开。

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

[反向代理指南](/zh-CN/guides/reverse-proxy/)逐一介绍了每个选项。

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle, route
```

设置站点根目录：`file_server`、`try_files` 以及其他处理文件的指令都以这个目录为基准解析路径。
`file_server` 可以有自己的根目录，但在这里设置能让所有指令都指向同一个位置。

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

控制站点证书的来源。没有 `tls` 行时，公网域名会自动从 Let's Encrypt 获取证书。

| 形式 | 行为 |
| --- | --- |
| `tls internal` | 由持久化的本地证书颁发机构签发。客户端必须信任它的根证书；`pingclair trust` 负责安装。 |
| `tls <cert> <key>`，或块中的 `cert` 和 `key` | 使用在别处签发的证书和私钥文件。 |
| `tls { auto }` | 通过 ACME 获取公网证书并续期，这也是公网域名的默认行为。 |

块中还接受 `acme_email`（或 `email`）、`http3`、`default_sni`、`client_auth`，以及 DNS-01 选项
（`dns`、`resolvers`、`dns_ttl`、`propagation_delay`、`propagation_timeout`、`dns_challenge_override_domain`）。

`http3 off` 让该站点退出 HTTP/3。它不会创建或移除 QUIC 监听；这由全局的 `servers { protocols … }`
列表决定（[TLS 能调什么](/zh-CN/guides/tls-tuning/#-提供哪些协议)）。

拒绝规则：

- `dns` 只接受 `cloudflare`。其他任何提供商都会被拒绝：
  ``DNS provider `route53` is not implemented; this build ships `cloudflare` only``。
- `protocols`、`ciphers`、`curves`、`alpn`、`on_demand`、`key_type`、`issuer`
  以及上面未列出的其他 Caddy 选项，都会被点名拒绝。
- `tls internal` 不能与 `auto`、ACME 邮箱或证书文件同时使用。

**下一版本**：

- `http3 off` 开始生效。在 v0.2.0-rc.3 中，它会被接受但不起任何作用。该站点的响应也不再在
  `Alt-Svc` 中宣告 HTTP/3。
- 内部证书颁发机构的根证书移到 `<store>/pki/authorities/local/root.crt`，与 Caddy 的布局相同。
  旧的 `<store>/internal/` 目录不会迁移：会创建新的颁发机构，客户端必须重新信任它的根证书。

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## Global options

全局选项写在文件顶部没有名称的块中。Caddy 嵌套在 `servers { … }` 下的选项，例如 `protocols` 和
`trusted_proxies`，也可以写在那里。

| 选项 | 语法 | 说明 |
| --- | --- | --- |
| `admin` | `admin [<address> [<token>]] \| off` | 开启 Admin API；默认地址是 `127.0.0.1:2019`。没有令牌时只接受回环地址的客户端。不写这个选项就没有 Admin API。 |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 控制自动 HTTPS 和 80 端口的重定向。`disable_certs` 和 `ignore_loaded_certs` 会被点名拒绝。 |
| `dns_refresh` | `dns_refresh <duration> \| off` | 重新解析以主机名指定的上游的间隔。默认是 `30s`。`off` 保留启动时解析到的地址。裸数字会被拒绝。 |
| `email` | `email <address>` | ACME 账户邮箱。 |
| `grace_period` | `grace_period <duration>` | 平滑停止时等待正在处理的请求的时长。 |
| `protocols` | `protocols h1 h2 h3` | 决定是否存在 HTTP/3 监听。参见 [TLS 能调什么](/zh-CN/guides/tls-tuning/#-提供哪些协议)。 |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | 允许在转发头部中声明客户端地址的对端。修改后需要重启。**下一版本**：也接受 Caddy 的写法 `trusted_proxies static <cidr \| private_ranges> ...`。 |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
