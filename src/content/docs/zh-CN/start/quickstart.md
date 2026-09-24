---
title: 快速开始
h1_emoji: '🏃'
sidebar:
  order: 2
description: 编写第一个 Pingclairfile，校验它，在前台或后台运行，并提供一个真实的目录。
---

本页从一台已完成安装的主机出发，走到一台由你掌控的运行中的服务器：磁盘上有一份配置，
编译校验通过，服务器可以启动、停止和观察，最后用一步验证证明确实是文件服务器在响应。
本页假定[安装](/zh-CN/start/install/)已经完成。

## 🧾 开始之前

安装脚本在 80 端口上留下了一个运行中的服务，它使用的是 `/etc/Pingclair/Pingclairfile`
中的配置。试验期间先停掉它，把端口空出来：

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

有三处细节值得注意：

- 顶部没有名称的块存放全局选项。`admin` 开启 Admin API，`pingclair start`、`stop` 和
  `reload` 都通过它连接运行中的服务器。
- 站点地址中的 `http://` 协议前缀强制使用明文。不写它，Pingclair 会把 `localhost`
  当作域名，用自己内部证书颁发机构签发的证书提供 HTTPS，此时明文 HTTP 客户端只会收到空响应
  （[HTTPS](/zh-CN/start/https/)）。
- `file_server` 的根目录是相对于当前工作目录的。

## 2. ✅ 运行前先校验

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` 默认读取 `./Pingclairfile`，也能识别 `./Caddyfile`。它会编译配置并执行语义检查，
例如证书路径是否存在。校验不是建议：未通过校验的配置不会运行，失败时最后一行会给出原因。

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

编译后的 JSON 才是服务器真正运行的形式。某个指令的行为与文档不符时，首先应该看这里。
如果想看 `pingclair fmt` 会如何改动文件：

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` 输出规范格式，使用两个空格缩进。

## 4. 🚀 运行

在前台运行，日志会一直输出到终端：

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

加上 `--watch`，每次保存文件都会重载配置，这就是开发时的工作循环：

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

也可以在后台运行，这样关闭 shell 后它依然存在：

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`、`stop` 和 `reload` 通过 Admin API 连接运行中的服务器，所以上面的配置设置了
`admin`。`pingclair run` 不需要它。

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

`ETag` 和 `Last-Modified` 表明文件服务器从磁盘读取了文件，响应体就是 `public/index.html`。
停止后台运行的服务器：

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ 一条命令启动服务器

有三个子命令无需配置文件就能提供服务，适合临时试验或一次性的主机：

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

每个命令启动时都会打印自己的监听地址：

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

发往 `:8082` 的每个请求都会反向代理到 `:8081` 上的文件服务器，`:8083` 则返回你传入的响应体。
`respond` 仅用于开发。

## 🔁 交给服务运行

服务运行的是 `/etc/Pingclair/Pingclairfile`，把配置放到那里，它才能在重启后继续生效：

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

`pc service reload` 请运行中的服务器重新读取文件，unit 的做法是发送 `SIGUSR1`。
`pingclair reload` 通过 Admin API 走到同一段代码，还会报告服务器对文件的判断，因此需要全局选项块中的
`admin` 选项；而 `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"`
两者都不需要。

无论用哪种方式，都应先校验，事后再查看结果：`systemctl reload` 只报告信号已经送达，
服务器的结论——已应用，或者被拒绝并附带原因——在 unit 的状态行和 journal 中。
被拒绝的重载会让旧配置继续提供服务，这正是拒绝的意义所在。
[以服务方式运行](/zh-CN/start/service/#-重载意味着什么)中有详细说明。

## ⚠️ 出问题时

- **`Address already in use`。** 安装脚本的服务仍然占用着 `:80`，或者有其他进程占用了你的端口。
  `sudo ss -ltnp | grep :80` 可以查出占用者；`sudo pc service stop` 能释放默认端口。
- **访问 `http://localhost:8080` 时出现 `Empty reply from server`。** 你在用明文与 TLS
  监听通信。在站点地址中加上 `http://` 前缀，或者改用 `https://` 访问并信任内部证书。
- **`Cannot reach admin API at 127.0.0.1:2019`。** 配置中没有 `admin` 选项，所以
  `pingclair stop` 和 `pingclair reload` 找不到监听方。把它加到全局选项块中，
  或者用 Ctrl-C 停止前台进程。
- **`curl` 访问回环地址时卡住。** 系统代理拦截了请求。改用 `curl --noproxy '*'` 重试。
- **校验失败并提示 `Unsupported feature`。** 该指令能被识别但尚未实现，错误信息会给出替代方案，
  例如 `encode br`：反向代理的响应尚未实现 Brotli，所以信息会指向 `encode zstd gzip`。

## 🧭 下一步

- [HTTPS](/zh-CN/start/https/)：为公网域名获取证书，来源可以是 Let's Encrypt 或内部证书颁发机构。
- [以服务方式运行](/zh-CN/start/service/)：unit、它的重载语义和日志。
- [Pingclairfile](/zh-CN/reference/pingclairfile/)：配置语言本身，包括匹配器、片段和导入。
