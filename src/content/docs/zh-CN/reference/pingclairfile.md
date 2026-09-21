---
title: Pingclairfile
h1_emoji: '📖'
description: 配置语言本身：文件结构、地址、matcher、snippet 与工具链。
---

Pingclairfile 是配置语言，遵循 Caddyfile 的约定：一个可选的 global options 块，随后是包含 directive 的 site block。本页说明语言本身；它接受的指令请见[指令参考](/zh-CN/reference/directives/)。

## 🔤 词法规则

| 规则 | 说明 |
| --- | --- |
| 注释 | `#` 延伸到行尾。 |
| 引号 | 含空格的值用 `"` 包住。引号会在解析前移除。 |
| 时长 | 必须带单位：`30s`、`5m`、`1h`。在需要时长的地方写裸数字会被拒绝。 |
| 大小写 | directive 与选项名称使用小写。 |
| Placeholder | `{host}`、`{path}`、`{args[0]}`、`{block}` 等 placeholder 会在 directive 文档所述的位置展开。 |

## 🌐 地址

Site block 以地址命名。地址决定 listener，而对公开名称而言，也决定自动 HTTPS 是否适用。

```caddyfile
example.com {              # host: ports 443 and 80, automatic HTTPS
localhost:8080 {           # host and port
:8080 {                    # any host on this port
http://example.com {       # force plaintext
```

端口属于地址，而不是另一个独立的 `listen` directive，因此地址与 listener 不可能互相矛盾。

## 🧭 Matcher

接受 matcher 的 directive 只应用于匹配的请求。Matcher 可以写在行内，也可以声明为 `@name` 后按名称引用。

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` 块按路由对 directive 分组；不带 matcher 的 `handle` 是该站点的兜底分支。

## 🧩 Snippet 与 import

Snippet 是可复用的片段。以 `(name) { ... }` 声明、以 `import name` 引入，并可接收调用方提供的块：

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

没有接到内容的 placeholder 不会插入任何东西，因此写了 `{block}` 的 snippet 在调用方未提供块时依然能编译。

## 🧰 命令行工具

| 命令 | 用途 |
| --- | --- |
| `pingclair validate [path]` | 编译并检查配置。默认读取 `./Pingclairfile`，其次是 `./Caddyfile`。 |
| `pingclair adapt --pretty` | 打印配置编译后的 JSON 形式。 |
| `pingclair fmt [--diff] [--overwrite]` | 格式化 Pingclairfile，或只显示变更。 |
| `pingclair run <path>` | 用指定的配置运行服务器。 |
| `pingclair list-modules` | 列出该二进制编译时包含的模块。 |
| `pingclair build-info` | 打印构建信息，包括使用的工具链。 |

## 🚫 不属于语言的部分

格式定义的名字多于服务器实现的数量。已被识别但没有实现的名字，会在加载时按名字拒绝，并附带“功能不存在”的说明。权威清单维护在服务器仓库的 README，[项目状态](/zh-CN/project/status/)页面则整理了主要类别。
