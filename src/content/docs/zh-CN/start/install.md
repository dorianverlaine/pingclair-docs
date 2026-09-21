---
title: 安装
description: 使用发布版二进制、Docker 或源码安装 Pingclair。
---

Pingclair 以 Linux 为目标平台。发布版二进制提供 `x86_64` 与 `aarch64` 两种架构；macOS 可以从源码编译，主要用于开发，并不是发布平台。

## 📌 发布状态

默认安装目标是 **v0.2.0-rc.3**，属于 release candidate。安装脚本会打印它实际安装的标签，并在解压前校验已公布的 SHA-256 校验和。

`v0.1.x` 系列已不再维护：没有修复、没有反向移植，也没有安全公告。其中一个升级理由是，`v0.1.x` 会解析 Admin API 的 `api_key` 字段却从不读取，等于该字段没有提供任何保护。

## 📦 从发布版二进制安装

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

安装脚本会下载对应当前架构的发布版二进制、校验校验和、安装 `pingclair` 与 `pc` 别名、创建非特权用户 `pingclair`、授予该用户绑定低位端口所需的 capability，并安装 `systemd` 单元。

如果要改为编译并安装 `main` 分支：

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main` 会在本机编译服务器，需要 Rust 1.98 或更高版本，以及 BoringSSL 与 jemalloc 需要的 C 工具链：`cmake`、`clang`、`libclang-dev`、`g++`、`git`。

验证安装结果：

```bash
pingclair version
pc version
```

## 🐳 Docker

镜像本身就是 config-file 模式：entrypoint 是 `pingclair`，默认命令是 `run /etc/pingclair/Pingclairfile`。因此 Compose 服务只需要挂载配置文件和数据存储。

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv
      - pingclair_tls:/var/lib/pingclair/certs

volumes:
  pingclair_tls:
```

把 `Pingclairfile` 放在 `./conf/`，静态文件放在 `./site/`，配置中以容器内的绝对路径引用，例如 `root /srv`。HTTPS、80 端口跳转与 HTTP/3 的行为，与直接部署在主机上完全相同。

两个容易出错的地方：

- **🔒 TLS 存储是状态，不是缓存。** 它保存已签发的证书、ACME 账户密钥，以及内部证书颁发机构。删除它意味着要重新签发证书，信任方也必须改用新的内部根证书。
- **⚠️ 不要添加 `command:`。** 镜像的默认命令已经是 `run /etc/pingclair/Pingclairfile`，覆盖它会取代该命令。

生产环境请固定使用发布标签，而不是 `latest`。已发布的标签列在[包页面](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)。

## 🛠️ 从源码编译

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

要求：Rust 1.98.1（CI 固定的版本）、`cmake`、`clang`、`libclang-dev`、`g++`、`git`。BoringSSL 会在编译过程中从源码构建，因此第一次编译需要数分钟。

## 🧭 下一步

- [快速开始](/zh-CN/start/quickstart/)：第一份配置，验证后实际运行。
- [配置模型](/zh-CN/concepts/configuration/)：验证机制如何决定什么可以运行。
