---
title: 安装
h1_emoji: '📦'
sidebar:
  order: 1
description: 在 Linux 主机上通过发布版二进制、Docker 或源码安装 Pingclair，并验证服务能响应。
---

Pingclair 以单个 Linux 二进制形式发布。本页完成安装，说明安装器留下了什么，
并验证服务器能响应。当前版本是 **v0.2.0-rc.3**，属于 release candidate，
本网站的每一页描述的都是这个版本。

## 🧾 需要什么

- 一台 `x86_64` 或 `aarch64` 的 Linux 主机，两种架构都有发布版二进制。
- `sudo` 或 root：安装器会写入 `/usr/local/bin`、`/etc/Pingclair`、
  `/var/lib/pingclair` 和 `/etc/systemd/system`。
- 走服务方式需要 `systemd`。没有 systemd 的主机请用 Docker 或前台运行，
  两者下面都会讲到。
- 如果要签发公共证书，80 和 443 端口要能从公网访问（[HTTPS](/zh-CN/start/https/)）。
  在云主机上，通常还要在服务商的防火墙里一并放行。

macOS 的源码构建只用于开发支持。macOS 不是发布平台。

## 📦 从发布版二进制安装

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

脚本先读 `releases.pingclair.com` 上的发版通道，打印将要安装的 tag，再用通道
为该压缩包公布的 SHA-256 校验——对不上就拒绝，不解压。该主机不通时会退回
GitHub 的 release API 与压缩包旁边发布的校验和文件，因此安装不依赖单一提供方。
随后它创建服务用户、授予绑定低端口的能力、写入默认配置、安装 unit，并启动
服务。完整的一轮会这样结束：

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

需要尚未发布的修复时，可以安装 `main` 而不是发布版二进制：

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main` 会在主机上克隆并编译。它需要 Rust 1.98 或更新版本，以及 BoringSSL 与
jemalloc 所需的 C 工具链：`cmake`、`clang`、`libclang-dev`、`g++` 和 `git`。
在 `apt` 和 `dnf` 系统上，这些包都由脚本自行安装。因为 BoringSSL 要从源码
编译，首次构建需要几分钟。

## 🗂️ 安装器留下了什么

| 路径 | 内容 |
| --- | --- |
| `/usr/local/bin/pingclair` | 服务器二进制。 |
| `/usr/local/bin/pc` | 指向同一二进制的软链接，用于短命令。 |
| `/etc/Pingclair/Pingclairfile` | 服务实际运行的配置。 |
| `/etc/Pingclair/Pingclairfile.example` | 带注释的示例，升级时不会被覆盖。 |
| `/var/lib/pingclair/.local/share/pingclair` | 证书存储：服务账号的数据目录，二进制的默认位置。 |
| `/var/lib/pingclair/html` | 在 80 端口提供的占位站点。 |
| `/var/log/pingclair` | 配置了 `log` 之后日志写入的位置。 |
| `/etc/systemd/system/pingclair.service` | 已启用并正在运行的 unit。 |

脚本结束时服务已经在提供服务。它运行的配置就是这份占位配置，一屏就能读完：

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

服务用户和证书存储只在缺失时创建，已存在的 `/etc/Pingclair/Pingclairfile`
永远不会被替换。正因如此，重复运行安装器是升级而不是重置
（[升级与卸载](/zh-CN/start/upgrade/)）。

## ✅ 验证安装

先问二进制自己的版本：

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc` 是同一个二进制，所以 `pc version` 输出同样的字符串。再问 `systemd`：

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://github.com/dorianverlaine/pingclair
   Main PID: 1808 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` 不是 `systemd` 看到进程还活着而猜出来的，而是服务器自己
上报的：unit 的类型是 `notify`，只有所有监听器都绑定完成之后，服务器才宣告
就绪。

最后问服务器本身：

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

带 `ETag` 和 `Last-Modified` 的 `200` 说明文件服务器应答了，正文就是
`/var/lib/pingclair/html` 里的占位页面。

## 🐳 Docker

已发布的镜像以配置文件模式运行：entrypoint 是 `pingclair`，默认命令是
`run /etc/pingclair/Pingclairfile`。镜像把 `/etc/pingclair` 和
`/var/lib/pingclair` 声明为卷，并暴露 80 和 443 端口。

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

有三个容易搞错的地方：

- **不要加 `command:`。** 镜像默认值已经是
  `run /etc/pingclair/Pingclairfile`，覆盖它会替换掉那条命令。
- **不要只挂 `/var/lib/pingclair/.local/share/pingclair`。** 存储除了证书目录之外还保存其他状态，
  容器只挂 `certs` 重建时会丢掉这些状态。请挂 `/var/lib/pingclair`。
- **固定发布 tag。** `latest` 会跟随最新发布，生产环境应写明版本，如上面的例子。
  已发布的 tag 列在
  [软件包页面](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)。

在用户不属于 `docker` 组的主机上，给命令加上 `sudo`，或者用
`sudo usermod -aG docker "$USER"` 加入一次并重新登录。在 Ubuntu 上，
`docker compose` 插件来自 `docker-compose-v2` 包。

## 🛠️ 从源码构建

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

要求：Rust 1.98.1（CI 固定的版本）、`cmake`、`clang`、`libclang-dev`、`g++`
和 `git`。构建过程会从源码编译 BoringSSL，因此首次构建需要几分钟。

## ⚠️ 安装失败时

- **`This script must be run as root`。** 脚本会写到主目录之外并安装 unit，
  请加上 `sudo` 重新执行。
- **Fedora 上 `setcap: command not found`。** 那是 `libcap` 包。安装器会装它，
  但手工搭建的主机可能缺失，而没有这个能力服务就无法绑定 80 和 443。
- **安装后立刻 `Job for pingclair.service failed`。** 读
  `journalctl -u pingclair -n 20`。常见原因是配置未通过校验，或者已经有别的
  进程占着 80 端口。
- **服务在跑，但从外面没有任何响应。** 监听器已绑定，数据包没有到达。先检查
  服务商的防火墙或安全组，再检查主机自身的规则。
- **主机没有 `systemd`。** 二进制装好可以运行，但安装器的服务步骤无法执行。
  请使用 Docker，或 `pingclair run`。

## 🧹 卸载

[升级与卸载](/zh-CN/start/upgrade/) 给出了拆除步骤，并指出哪些目录值得保留。

## 🧭 下一步

- [快速开始](/zh-CN/start/quickstart/)：把占位页面换成你自己的配置，提供真实
  站点。
- [HTTPS](/zh-CN/start/https/)：为公开域名签发证书。
- [以服务方式运行](/zh-CN/start/service/)：unit 做了什么，以及如何安全地重载。
