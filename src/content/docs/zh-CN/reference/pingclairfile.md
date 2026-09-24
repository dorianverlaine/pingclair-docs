---
title: Pingclairfile
h1_emoji: '📖'
description: Pingclairfile 的结构，包括词法规则、站点地址、匹配器、路由顺序、片段，以及检查它的工具。
---

Pingclairfile 是 Pingclair 的配置文件，使用 Caddyfile 语言编写：先是一个可选的全局选项块，
然后每个站点一个块，块中是指令。只使用受支持指令的 Caddyfile 可以原样加载。本页介绍这门语言本身；
每个指令的作用见[指令参考](/zh-CN/reference/directives/)。

📌 本页描述的是最新发布的版本 **v0.2.0-rc.3**。

## 🔤 词法规则

| 规则 | 说明 |
| --- | --- |
| 注释 | 从 `#` 到行尾。 |
| 引号 | 包含空格的值用 `"` 括起来。引号会在解析值之前去掉。 |
| 时长 | 必须带单位：`30s`、`5m`、`1h`。在需要时长的地方写裸数字会被拒绝。 |
| 大小写 | 指令名和选项名都是小写。 |
| 占位符 | `{host}`、`{path}`、`{args[0]}`、`{block}` 以及其他占位符，会在指令文档说明的位置展开。 |

## 🌐 地址

站点块以地址命名。地址决定站点监听哪个端口，以及是否通过 HTTPS 提供服务。

```text
example.com {          # HTTPS on 443 with a public certificate; 80 redirects
example.com:8443 {     # HTTPS on 8443: a host with a port is still HTTPS
localhost:8080 {       # HTTPS on 8080, from the internal authority
:8080 {                # plaintext HTTP on 8080, for any host
http://example.com {   # plaintext HTTP on 80
```

和 Caddy 一样，带端口但不带协议前缀的主机通过 HTTPS 提供服务。要在任意端口上使用明文，
请在地址前写上 `http://`。共用一个端口的两个站点必须在 TLS 上保持一致，否则配置会被拒绝。

## 🧭 匹配器

匹配器把指令限定在部分请求上。它可以直接内联书写，例如 `/api/*` 这样的路径；
也可以用 `@name` 声明一次，再通过这个名称引用。

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` 块把多个指令组织成一条路由。同级的 `handle` 块互相排斥：
恰好只有其中一个会执行，没有匹配器的 `handle` 是站点的兜底路由。在 v0.2.0-rc.3 中，
执行的是匹配路径最具体的那个。**下一版本**：执行排序最靠前的那个，较长的路径排在较短的
之前，其余按文件中的顺序（见[由哪条路由响应](#-由哪条路由响应)）。

`client_ip` 匹配应用 `trusted_proxies` 之后的客户端地址。**下一版本**：`remote_ip`
改为匹配连接本身的对端，与 Caddy 一致；在 v0.2.0-rc.3 中，两者匹配的都是转发过来的客户端。

## 🧭 由哪条路由响应

在 v0.2.0-rc.3 中，当多条路由匹配同一个请求时，路径最具体的那条负责响应，无论它写在哪里。

**下一版本**：路由按照 Caddy 的指令顺序依次尝试，第一个匹配的负责响应。例如 `respond` 排在
`file_server` 之前，所以在下面的站点中，`/assets/a.txt` 得到的是 `hello`，而不是文件本身：

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

要让较窄的路由排在前面，可以把路由包进 `handle` 块，用全局选项 `order` 移动某个指令，
或者把它们列在一个 `route` 块中，它会保持书写顺序。

## 🧩 片段与导入

片段是可复用的配置片段。以 `(name) { ... }` 声明的片段用 `import name` 引入，
并且可以从调用方接收一个块：

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

`{args[0]}` 是片段名之后的第一个参数，`{block}` 是调用方提供的块。调用方没有提供块时，
`{block}` 展开为空，片段仍然可以编译。

## 🧰 命令行工具

编写配置时，有三个命令可以帮忙：

- `pingclair validate` 编译文件，并指出第一个问题。
- `pingclair adapt --pretty` 打印文件编译后的 JSON。
- `pingclair fmt` 格式化文件。

[命令行](/zh-CN/reference/command-line/)列出了所有子命令和参数。

## 🚫 不属于这门语言的部分

Caddyfile 语言定义的指令和选项比 Pingclair 实现的要多。对于 Pingclair 能识别但尚未实现的名称，
文件加载时会被拒绝，并给出缺失功能的名称，所以配置永远不会在某个设置被悄悄丢弃的情况下运行。
服务器代码仓库的 README 保存着完整列表，[项目状态](/zh-CN/project/status/)对其做了汇总。
