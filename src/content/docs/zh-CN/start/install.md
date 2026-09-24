---
title: 安装
h1_emoji: '📦'
sidebar:
  order: 1
description: 通过发布版二进制文件、Docker 或源码在 Linux 主机上安装 Pingclair，并确认服务能够响应。
---

Pingclair 以单个 Linux 二进制文件发布。本页完成安装，说明安装脚本留下了哪些东西，
并确认服务器确实在响应。当前版本是 **v0.2.0-rc.3**，属于候选版本（release
candidate），本站所有页面描述的都是这个版本。

## 🧾 需要准备什么

- 一台 `x86_64` 或 `aarch64` 架构的 Linux 主机，两种架构都有发布版二进制文件。
- `sudo` 或 root 权限：安装脚本会写入 `/usr/local/bin`、`/etc/Pingclair`、
  `/var/lib/pingclair` 和 `/etc/systemd/system`。
- 以服务方式运行需要 `systemd`。没有 `systemd` 的主机可以使用 Docker，或者在前台运行
  服务器，下文都有介绍。
- 如果需要公网证书（[HTTPS](/zh-CN/start/https/)），80 和 443 端口必须能从互联网访问。
  在云主机上，这通常意味着还要在云服务商的防火墙中放行这两个端口。

macOS 可以从源码构建，并作为开发环境受支持，但不是正式发布的平台。

## 📦 通过发布版二进制文件安装

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

脚本先读取 `releases.pingclair.com` 上的发布渠道，打印即将安装的版本标签，再用该渠道公布的
SHA-256 校验压缩包——校验不通过的压缩包会被拒绝，不会解压。如果无法连接这台主机，脚本会退回到
GitHub releases API 以及与压缩包一同发布的校验文件，因此安装不依赖单一提供方。随后它创建服务用户，
授予该用户绑定低位端口的能力，写入默认配置，安装 unit 并启动服务。完整的一次运行以如下输出结束：

```text
Detected architecture: x86_64
Installing v0.2.0-rc.3 — a release candidate, not a final release.
Downloading https://releases.pingclair.com/pingclair/releases/0.2.0-rc.3/pingclair-linux-x86_64.tar.gz (from releases.pingclair.com)...
✅ sha256 matches the release channel document
Creating system user 'pingclair'...
Setting capabilities...
Configuring directories and assets...
Fetching default landing page...
Creating default Pingclairfile...
Installing Systemd service...
Creating 'pc' symlink...
✅ Installation Complete!
Use pc service status to check the service.
Config: /etc/Pingclair/Pingclairfile
```

如果需要尚未发布的修复，可以改为在主机上构建 `main` 分支：

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main` 会在主机上克隆并编译服务器。它需要 Rust 1.98 或更高版本，以及 BoringSSL 和
jemalloc 所需的 C 工具链：`cmake`、`clang`、`libclang-dev`、`g++` 和 `git`。
在使用 `apt` 或 `dnf` 的系统上，脚本会自行安装这些软件包。由于 BoringSSL 要从源码编译，
首次构建需要几分钟。

## 🗂️ 安装脚本留下了什么

| 路径 | 内容 |
| --- | --- |
| `/usr/local/bin/pingclair` | 服务器二进制文件。 |
| `/usr/local/bin/pc` | 指向同一个二进制文件的符号链接，用作简写。 |
| `/etc/Pingclair/Pingclairfile` | 服务运行的配置。 |
| `/etc/Pingclair/Pingclairfile.example` | 带注释的示例，升级时从不覆盖。 |
| `/var/lib/pingclair/.local/share/pingclair` | 证书存储：即服务用户的数据目录，也是二进制文件默认查找的位置。 |
| `/var/lib/pingclair/html` | 80 端口上提供的占位站点。 |
| `/var/log/pingclair` | 配置 `log` 输出后，日志写入的位置。 |
| `/etc/systemd/system/pingclair.service` | unit 文件，已启用并在运行。 |

脚本结束时，服务已经在提供服务。它运行的是占位配置，一屏就能读完：

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

服务用户和证书存储只在不存在时才会创建，已有的 `/etc/Pingclair/Pingclairfile`
也从不被替换。正因如此，重新运行安装脚本是一次升级，而不是重置
（[升级与卸载](/zh-CN/start/upgrade/)）。

## ✅ 验证安装

先向二进制文件查询版本：

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc` 是同一个二进制文件，所以 `pc version` 输出相同的字符串。接着看看 `systemd` 的判断：

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` 由服务器自己报告，而不是 `systemd` 看到进程还活着就下的结论：
unit 的类型是 `notify`，服务器只有在所有监听都绑定之后才报告就绪。

最后，直接请求服务器：

```bash
curl -i http://localhost/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 18747
Last-Modified: Tue, 22 Sep 2026 03:21:54 GMT
ETag: "493b-6ab1f452"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`200` 加上 `ETag` 和 `Last-Modified`，说明是文件服务器在响应，响应体就是
`/var/lib/pingclair/html` 中的占位页面。

## 🐳 Docker

发布的镜像以配置文件模式运行：入口点是 `pingclair`，默认命令是
`run /etc/pingclair/Pingclairfile`。镜像把 `/etc/pingclair` 和 `/var/lib/pingclair`
声明为卷，并暴露 80 和 443 端口。

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv:ro
      - pingclair_tls:/var/lib/pingclair

volumes:
  pingclair_tls:
```

```bash
mkdir -p conf site
printf ':80 {\n    file_server /srv\n}\n' > conf/Pingclairfile
echo '<h1>hello from the container</h1>' > site/index.html
docker compose up -d
curl -i http://localhost/
```

有三点容易出错：

- **不要添加 `command:`。** 镜像的默认命令已经是 `run /etc/pingclair/Pingclairfile`，
  覆盖它就会替换掉这条命令。
- **挂载整个 `/var/lib/pingclair`，而不只是证书目录。** 存储在证书旁边还保存了状态，
  只挂载一部分的容器在重建后会丢失这些状态。
- **固定到某个已发布的标签。** `latest` 会跟随最新版本；生产环境应当像示例那样写明版本。
  已发布的标签列在[软件包页面](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)上。

如果当前用户不在 `docker` 组中，请在命令前加 `sudo`，或者执行一次
`sudo usermod -aG docker "$USER"` 加入该组并重新登录。在 Ubuntu 上，`docker compose`
插件由 `docker-compose-v2` 软件包提供。

## 🛠️ 从源码构建

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

依赖：Rust 1.98.1（CI 固定的版本）、`cmake`、`clang`、`libclang-dev`、`g++` 和 `git`。
BoringSSL 会在构建过程中从源码编译，所以首次构建需要几分钟。

## ⚠️ 安装失败时

- **`This script must be run as root`。** 脚本要写入主目录以外的位置并安装 unit，
  请用 `sudo` 重新运行。
- **Fedora 上出现 `setcap: command not found`。** 这个命令来自 `libcap` 软件包。
  安装脚本会安装它，但手工搭建的主机可能缺少；没有这项能力，服务就无法绑定 80 和 443 端口。
- **安装后立即出现 `Job for pingclair.service failed`。** 查看
  `journalctl -u pingclair -n 20`。常见原因是配置未通过校验，或者 80 端口已被其他程序监听。
- **服务在运行，但外部访问没有响应。** 监听已经绑定，但数据包始终没有到达。
  先检查云服务商的防火墙或安全组，再检查主机自身的规则。
- **主机没有 `systemd`。** 二进制文件已安装且可以使用，但安装脚本的服务步骤无法执行。
  请改用 Docker 或 `pingclair run`。

## 🧹 再次卸载

[升级与卸载](/zh-CN/start/upgrade/)介绍了卸载步骤，并列出了保存着值得保留的数据的目录。

## 🧭 下一步

- [快速开始](/zh-CN/start/quickstart/)：用自己的配置替换占位配置，提供一个真实的站点。
- [HTTPS](/zh-CN/start/https/)：为公网域名获取证书。
- [以服务方式运行](/zh-CN/start/service/)：unit 做了什么，以及如何安全地重载。
