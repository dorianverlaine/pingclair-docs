---
title: 配置模型
h1_emoji: '🧠'
description: Pingclairfile 的结构，它如何在任何请求到达之前完成编译和校验，路由如何选定，以及重载会改变什么。
---

Pingclairfile 在加载时编译一次，成为服务器运行的状态。由此产生两个结果，它们解释了 Pingclair 的大部分行为。
凡是配置能够决定的工作，例如解析地址或编译匹配器，都在第一个请求到来之前完成，而不是在每个请求上重复进行。
而无法兑现的配置会在加载时就让服务器停下，而不是在日后某个没人测试过的请求上出错。
本页描述的是 **v0.2.0-rc.3**。

## 🗂️ 一个文件由全局选项和随后的站点块组成

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

- **全局选项**写在文件顶部一个没有名称的块中，配置不属于某个具体站点的内容：ACME 账户邮箱、
  Admin API、自动 HTTPS、受信任的代理，以及以主机名指定的上游的 DNS 刷新。
  [指令参考](/zh-CN/reference/directives/#global-options)列出了全部选项。
- **站点块**以地址命名：主机、端口，或两者兼有。端口是地址的一部分，而不是单独的指令，
  所以地址和监听不可能互相矛盾。
- **指令**是站点块中的语句。有的接受参数，有的接受嵌套块，有的两者都接受。
- **注释**以 `#` 开头，直到行尾。
- **包含空格的值要加引号。** 时长必须带单位：`30s` 表示三十秒，在需要时长的地方写一个裸的 `30` 会被拒绝。

## 🧭 匹配器决定指令作用于哪些请求

命名匹配器用 `@name` 声明，在指令后写上这个名称即可使用：

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

`handle` 块把一条路由的指令组织在一起。一个请求只由一个 `handle` 块响应，
没有匹配器的 `handle` 会接住其他块都没有处理的请求：

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

## 🚦 由哪条路由响应请求

当一个站点中有多条路由匹配同一个请求时，必须由其中一条来响应。在 v0.2.0-rc.3 中，
路径最具体的路由胜出，无论它写在文件的哪个位置。

📌 **下一版本**（破坏性变更）：在 `main` 上，路由改为遵循 Caddy 的指令顺序：指令按种类排名
（例如 `respond` 排在 `file_server` 和 `reverse_proxy` 之前），按这个顺序第一条匹配的路由负责响应。
如果某个站点依赖一条写在较宽泛路由下方、而后者排名更靠前的较窄路由，升级后它的响应就会改变。
有两种写法能在两个版本上都保持原来的结果：把每条路由放进各自的 `handle` 块（上面的示例已经这样做了），
或者把路由列在一个 `route` 块中，它会保持书写顺序。
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
在 Unreleased 下记录了完整的排名。

## 🧩 片段与导入复用配置

片段是一段可复用的配置，以 `(name) { ... }` 声明，用 `import name` 插入。调用方可以传入参数和一个块；
片段在写 `{block}` 的位置接收这个块：

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

在被导入的文件中定义的片段，对其后的导入可见。指令参数列表中的占位符会被拒绝：
Caddy 会在插入片段后重新解析这一行，而 Pingclair 的解析器做不到，所以它会明确报错，
而不是去猜这一行原本想表达什么。

## 🛡️ 校验会拒绝服务器做不到的事

`pingclair validate` 编译文件，并执行语法之外的检查：指令参数、匹配器语法、证书和私钥文件是否存在，
以及策略约束，例如哪些对端可以设置表示客户端身份的头部。

未通过这些检查的配置不会运行。决定失败与否的规则有三条：

- **未实现的名称会被点名拒绝。** Pingclair 能识别 Caddyfile 格式定义的每一个名称。
  对于尚未实现的名称，它会给出功能缺失的提示；绝不会把它当作拼写错误，也绝不会悄悄忽略。
- **无法兑现的选项会被拒绝，而不是降级。** `encode br` 是编译错误，因为没有流式的 Brotli 编码器；
  服务器不会悄悄改用 gzip。
- **语法正确但指向不存在的文件，仍然是错误。** 服务器代码仓库中的 `examples/full_featured.pingclair`
  语法有效，但在其中引用的证书路径不存在的机器上，`validate` 仍然会拒绝它。

服务器加载文件时也会执行同样的检查，重载时也不例外。

## 🔁 重载无需重启即可替换配置

重载会重新读取文件、编译，并在进程持续运行的同时把结果替换进去。如果新文件编译失败，
之前的配置会继续提供服务。有三种方式可以触发重载：

- `pc service reload`（或 `systemctl reload pingclair`）通过已安装的 unit 发送 `SIGUSR1`。
- `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` 直接发送同一个信号。
- `pingclair reload` 通过 Admin API 触发，并打印服务器的结论。它需要 `admin` 全局选项。

`systemctl reload` 只能报告信号已经送达，所以服务器的结论出现在 unit 的状态行和 journal 中。

有些变更无法通过重载应用。此时服务器会拒绝这次重载并保留旧配置，而不是只应用其中一部分：

- **监听变更。** 新增、移除或移动地址，或者把监听在明文和 TLS 之间切换，都需要重启，
  因为监听套接字是在启动时创建的。
- **全局选项。** 在启动时确定的选项，例如 `trusted_proxies`，作用于整个进程，
  所以对全局选项块的任何修改都需要重启。
- **证书拓扑。** 新增 TLS 主机名，或者改变站点获取证书的方式，都需要重启。

拒绝信息会说明是哪项变更，例如 `listener topology changed (added: …, removed: …)`，
执行 `sudo pc service restart` 即可应用。

[以服务方式运行](/zh-CN/start/service/#-重载意味着什么)展示了每种结果的样子。

## 🧭 相关页面

- [Pingclairfile](/zh-CN/reference/pingclairfile/)：配置语言的完整说明。
- [指令参考](/zh-CN/reference/directives/)：每个指令和选项。
- [架构](/zh-CN/concepts/architecture/)：运行编译后配置的是什么。
