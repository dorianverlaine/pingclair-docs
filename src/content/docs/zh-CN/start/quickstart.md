---
title: 快速开始
description: 写出第一份 Pingclairfile，验证配置，然后开始提供服务。
---

本页从一份全新安装走到可运行的服务器：先让 8080 端口提供静态站点，再放上一个反向代理。

## 1. ✍️ 写一份配置

创建名为 `Pingclairfile` 的文件：

```caddyfile
localhost:8080 {
    file_server ./public
}
```

文件中只有一个 site block。`localhost:8080` 是这个站点响应的地址，`file_server` 负责提供文件，`./public` 是文件的来源目录，相对于运行时的工作目录。

## 2. ✅ 验证配置

```bash
pingclair validate
```

`validate` 默认读取 `./Pingclairfile`，也会探测 `./Caddyfile`。它会编译配置、检查证书路径一类的语义条件，并在出问题时以非零状态退出。验证不是建议：验证失败的配置不会运行。

编写配置时，另外两个命令很有用：

```bash
pingclair adapt --pretty   # 打印编译后的 JSON 形式
pingclair fmt --diff       # 显示格式差异，但不写回文件
```

## 3. 🚀 运行

```bash
pingclair run Pingclairfile
```

进程会记录每个开启的 listener，随后持续处理请求，直到收到终止信号。

## 4. 🔍 验证结果

另开一个终端：

```bash
curl -i http://localhost:8080/
```

预期会看到 `200`，以及所提供文件的 `ETag` 与 `Last-Modified` 响应头。

如果请求反而挂起，请检查是否有系统代理拦截了回环流量，并改用 `curl --noproxy '*'` 重试。

## 5. 🔁 代理一个应用

把 site block 换成指向 3000 端口后端服务的反向代理：

```caddyfile
localhost:8080 {
    reverse_proxy localhost:3000
}
```

用相同的命令重新验证并运行。响应现在来自后端。多个上游、负载均衡策略、健康检查与失败行为，请见 [`reverse_proxy`](/zh-CN/reference/directives/#reverse_proxy)。

## 6. 🔒 终止 TLS

公开域名会自动申请证书：

```caddyfile
{
    email admin@example.com
}

example.com {
    reverse_proxy localhost:3000
}
```

自动 HTTPS 需要站点地址是公开名称，并且 ACME 挑战能访问到服务器，通常意味着需要 80 端口。如果是私有源站，改用 `tls internal` 由本地证书颁发机构签发；客户端必须信任其根证书，位置在 `$PINGCLAIR_TLS_STORE/internal/root.crt`。

## 7. ⚙️ 作为服务运行

安装脚本会创建 `systemd` 单元，并由 `pc` 命令管理：

```bash
pc service start
pc service status
pc service reload   # 重新读取配置，不重启进程
```

## 🧭 下一步

- [配置模型](/zh-CN/concepts/configuration/)
- [架构](/zh-CN/concepts/architecture/)
- [指令参考](/zh-CN/reference/directives/)
