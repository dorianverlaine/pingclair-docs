---
title: 配置模型
h1_emoji: '🧠'
description: Pingclairfile 如何被解析、编译、验证，并转换为运行时状态。
---

Pingclairfile 在加载时编译一次，成为服务器实际执行的运行时状态。由此产生两个结果，也解释了本项目的大部分行为：配置能决定的事情都在第一个请求之前完成；而无法被满足的配置会让服务器停止，而不是在请求到来时妥协。

## 🗂️ 文件结构

文件包含一个可选的 global options 块，后面跟着一个或多个 site block。

```caddyfile
{
    email admin@example.com
}

example.com {
    encode zstd gzip
    reverse_proxy 10.0.0.10:8080 10.0.0.11:8080
}

:8080 {
    file_server ./public
}
```

- **Global options** 写在文件最前面、没有名称的块中，用于配置不属于单个站点的状态：ACME 账户邮箱、Admin API、自动 HTTPS 行为、trusted proxies，以及主机名上游的 DNS 重新解析。可用选项列在[指令参考](/zh-CN/reference/directives/#global-options)。
- **Site block** 以地址命名：主机、端口，或两者兼具。端口属于地址的一部分，而不是另一个独立指令，因此只有一个地方需要保持两者一致。
- **Directive** 是 site block 内的语句。有些接受参数列表，有些接受嵌套块，有些两者都接受。
- **注释**以 `#` 开始，延伸到行尾。
- **含空格的值要加引号。** 时长必须带单位：`30s` 是三十秒，而在需要时长的地方写裸数字 `30` 会被拒绝。

## 🧭 Matcher

Matcher 用来选出某个 directive 要应用到哪些请求。命名 matcher 以 `@name` 声明，之后按名称引用：

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

`handle` 块按路由对行为分组，并支持不带 matcher 的兜底分支：

```caddyfile
example.com {
    handle /assets/* {
        file_server ./assets
    }

    handle {
        respond "Page Not Found" 404
    }
}
```

## 🧩 Snippet 与 import

Snippet 是可复用的片段，以 `(name) { ... }` 声明，并用 `import name` 引入。Snippet 也能接收调用方提供的块，并把它插入到片段中写 `{block}` 的位置：

```caddyfile
(site) {
    https://{args[0]} {
        {block}
    }
}

import site example.com {
    reverse_proxy 127.0.0.1:3000
}
```

在被 import 的文件里定义的 snippet，对之后的 import 是可见的。放在参数列表中的 placeholder 会被拒绝，因为 directive 树无法像 token 层那样在插入后重新解析该行。

## 🛡️ 验证

`pingclair validate` 会编译文件并执行语义检查：指令参数、matcher 语法、证书与密钥路径，以及诸如“哪些对端可以声明客户端身份请求头”之类的策略限制。

失败一律明确且封闭：

- **未实现的名字会按名字拒绝。** 格式定义的每个名字都会被识别，服务器未实现的会给出“功能不存在”的提示。它不会被当成拼写错误，也不会被忽略：包含这类名字的配置不会启动。
- **无法兑现的选项会被拒绝，而不是降级。** 例如在 `encode` 中指定 Brotli 会是编译错误，因为代理没有流式 Brotli 编码器；服务器不会静默改用 gzip。
- **语法正确但引用了不存在材料的文件仍会被拒绝。** 仓库中的 `examples/full_featured.pingclair` 是合法的 Caddyfile 语法，但仍然会被拒绝，而且理由正确：它指定的证书路径不存在于执行检查的机器上。

同样的检查会在加载时运行，因此重新加载时如果配置验证失败，先前的状态会保持不变。

## 🔁 重新加载

`pc service reload` 会重新读取配置，而不重启进程。在启动阶段建立的进程级策略，例如 `trusted_proxies`，要在重启后才会生效。
