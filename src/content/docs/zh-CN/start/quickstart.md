---
title: 快速开始
h1_emoji: '🏃'
sidebar:
  order: 2
description: 编写第一份 Pingclairfile，校验它，以前台或后台方式运行，并提供真实目录。
---

本页从一台装好的主机走到你完全掌握的服务器：磁盘上的配置、经过校验的编译、可以
启动、停止和监视的服务进程，以及一个证明文件服务器确实应答了的验证步骤。前提是
[安装](/zh-CN/start/install/) 已经完成。

## 🧾 开始之前

安装器留下了一个跑在 80 端口上的服务，它握着 `/etc/Pingclair/Pingclairfile`
里的配置。做实验期间先把它停掉，腾出端口：

```bash
sudo pc service stop
```

```bash
mkdir -p ~/demo/public
cd ~/demo
echo '<h1>hello from ~/demo/public</h1>' > public/index.html
```

## 1. ✍️ 编写配置

创建 `~/demo/Pingclairfile`：

```caddyfile
{
    admin 127.0.0.1:2019
}

http://localhost:8080 {
    file_server ./public
}
```

有三点值得点名。顶部的无名代码块是全局选项，`admin` 让 `pingclair start`、
`stop`、`reload` 能跟正在运行的服务器对话。站点地址带 scheme，`http://` 强制
明文；不写它的话，Pingclair 会把 `localhost` 当成名字，用自带的证书颁发机构
提供 HTTPS，明文 HTTP 客户端看到的只会是空响应（[HTTPS](/zh-CN/start/https/)）。
`file_server` 的根目录相对于当前工作目录。

## 2. ✅ 运行前先校验

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` 默认读取 `./Pingclairfile`，也能识别 `./Caddyfile`。它编译配置并
执行语义检查，例如证书路径是否存在。校验不是建议：未通过的配置不会运行，最后
一行会给出原因。

## 3. 🧭 看配置会变成什么

```bash
pingclair adapt --pretty
```

```text
{
  "debug": false,
  "servers": [
    {
      "name": "localhost",
      "names": [
        "localhost"
      ],
      "listen": [
        "[::]:8080"
      ],
```

编译后的 JSON 就是服务器真正执行的形式。当某个指令的行为与文档不符时，这里是
第一个该看的地方。想反过来看 `pingclair fmt` 会改文件里的什么：

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` 输出规范形式，缩进是两个空格。

## 4. 🚀 运行

前台运行，日志留在终端里：

```bash
pingclair run Pingclairfile
```

```text
🚀 Starting Pingclair with config: Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: Pingclairfile
🔧 Configured 1 server(s)
🔐 Auto HTTPS: enabled
```

加上 `--watch`，每次保存都会重新加载配置，这就是开发循环：

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

也可以放到后台，让它不受 shell 影响：

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`、`stop`、`reload` 通过 Admin API 联系正在运行的服务器，这就是
上面配置里要写 `admin` 的原因。`pingclair run` 不需要它。

## 5. 🔍 验证

```bash
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 34
Last-Modified: Tue, 22 Sep 2026 03:26:39 GMT
ETag: "22-6ab1f56f"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag` 和 `Last-Modified` 说明文件服务器从磁盘读取了文件，正文就是
`public/index.html`。要停掉后台服务器：

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ 一条命令起服务

有三个子命令不需要配置文件就能提供服务，适合临时试验或一次性主机：

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

启动时各自打印自己的监听地址：

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

发给 `:8082` 的每个请求都会转给 `:8081` 上的文件服务器，`:8083` 直接返回你传入
的正文。`respond` 只用于开发。

## 🔁 交给服务

服务运行的是 `/etc/Pingclair/Pingclairfile`，所以把配置放到那里才能扛过重启：

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

`pc service reload` 让运行中的服务器重新读取文件，unit 通过发送 `SIGUSR1` 做到
这一点。`pingclair reload` 通过 Admin API 走到同一段代码，还会报告服务器对文件的
判断，需要在全局选项块里写 `admin`；`sudo kill -USR1 "$(systemctl show -p MainPID
--value pingclair)"` 则两者都不需要。

两条路都要先校验，然后读回答案：`systemctl reload` 只能报告信号已经送达，服务器
的判断——已应用，还是带着原因被拒绝——在 unit 的 status line 和日志里。被拒绝的
重载会让旧配置继续服务，这正是拒绝的意义。
[以服务方式运行](/zh-CN/start/service/#-重载意味着什么) 是详细版本。

## ⚠️ 出问题时

- **`Address already in use`。** 安装器的服务还占着 `:80`，或者别的进程占着你
  的端口。`sudo ss -ltnp | grep :80` 会显示占用者，`sudo pc service stop` 会
  释放默认那个。
- **在 `http://localhost:8080` 上收到 `Empty reply from server`。** 你在用明文
  跟 TLS 监听器说话。给站点地址加上 `http://`，或者信任内部证书后用 `https://`
  访问。
- **`Cannot reach admin API at 127.0.0.1:2019`。** 配置里没有 `admin`，没有
  对象接收 `pingclair stop` 和 `pingclair reload`。把它加进全局选项块，或者用
  Ctrl-C 停掉前台进程。
- **`curl` 在回环地址上卡住。** 系统代理拦截了请求。加上 `curl --noproxy '*'`
  重试。
- **校验以 `Unsupported feature` 失败。** 指令被识别但没有实现，消息会给出
  替代方案，例如 `encode br`：代理响应没有实现 Brotli，于是消息指向
  `encode zstd gzip`。

## 🧭 下一步

- [HTTPS](/zh-CN/start/https/)：为公开域名签发证书，走 Let's Encrypt 或内部
  证书颁发机构。
- [以服务方式运行](/zh-CN/start/service/)：unit、重载语义和日志。
- [Pingclairfile](/zh-CN/reference/pingclairfile/)：语言本身，包括 matcher、
  snippet 和 import。
