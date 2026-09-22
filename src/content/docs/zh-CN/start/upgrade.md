---
title: 升级与卸载
h1_emoji: '🧹'
sidebar:
  order: 5
description: 重跑安装器完成升级、固定容器 tag、回滚到旧版本，并在不丢值得保留的东西的前提下全部拆掉。
---

一次升级只替换两样东西 —— 二进制和 service unit —— 你的配置和证书不动。本页
演示这件事、容器里的对应做法、必须往回退时的回滚路径，以及拆除步骤。

## 🧾 什么能扛过什么

| 路径 | 升级时 |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | 保留。安装器只在它缺失时才写入。 |
| `/etc/Pingclair/Pingclairfile.example` | 被当前示例替换。 |
| `/var/lib/pingclair/certs` | 保留。已签发的证书和 ACME 状态原地不动。 |
| `/var/lib/pingclair/html` | 保留。 |
| `/usr/local/bin/pingclair` 与 `pc` | 被新版本替换。 |
| `/etc/systemd/system/pingclair.service` | 被重写，然后服务重启。 |

## ⬆️ 用安装器升级

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

脚本向 GitHub 查询最新 release tag，打印出来，校验压缩包的 SHA-256，替换二进制
与 unit，然后重启服务。已经存在的配置文件不会被碰，这才使它成为升级而不是重置：

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

确认新版本，并确认旧配置仍在提供服务：

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

安装器总是装最新 release。没有指定版本的开关；需要特定版本时，用下面的回滚。

## 🐳 升级容器

主机上什么都没装，所以升级就是改 tag 再 pull。在 compose 文件里固定新版本：

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
```

```bash
docker compose pull
docker compose up -d
docker logs pingclair 2>&1 | head -3
```

```text
🚀 Starting Pingclair with config: /etc/pingclair/Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: /etc/pingclair/Pingclairfile
```

配置和证书存储都在卷里，所以新容器会在旧容器留下的位置找到它们。两点要注意：

- **映射了 80 端口的容器，在 systemd 服务运行时起不来。** 停掉其中一个：
  `sudo pc service stop`，或者改容器一侧的发布端口。
- **`latest` 会跟随最新 release。** 生产环境请固定版本，让升级是一个决定，而不是
  一次 pull 的副作用。

## ⏪ 回滚到旧版本

新版本必须退回去时，从发版主机取上一个版本，用它公布的 digest 校验，然后替换
二进制：

```bash
mkdir -p /tmp/rollback && cd /tmp/rollback
version=0.2.0-rc.2
base="https://releases.pingclair.com/pingclair/releases/$version"
curl -fsSL "$base/release.json" -o release.json
tarball=pingclair-linux-x86_64.tar.gz
expected="$(jq -r ".assets[] | select(.name == \"$tarball\") | .digest" release.json | sed 's/^sha256://')"
curl -fsSLO "$base/$tarball"
printf '%s  %s\n' "$expected" "$tarball" | sha256sum -c -
mkdir -p extract && tar -xzf "$tarball" -C extract
```

```text
pingclair-linux-x86_64.tar.gz: OK
```

```bash
sudo systemctl stop pingclair
sudo install -m 0755 extract/pingclair /usr/local/bin/pingclair
sudo systemctl start pingclair
pingclair version
```

```text
v0.2.0-rc.2
```

然后针对回滚后的版本校验配置，因为旧版本没有实现的指令会按名字被拒绝，而不是被
忽略：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## 🧹 卸载

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

之后 `systemctl status pingclair` 会回答 `Unit pingclair.service could not be
found`，命令消失，80 端口上没有任何监听。留在磁盘上的，是刻意保留的你的数据：

```text
/etc/Pingclair/Pingclairfile      配置，仍然有效
/var/lib/pingclair/certs          已签发证书与 ACME 状态
/var/lib/pingclair/html           占位站点
/var/log/pingclair                日志输出目录
```

如果打算重新安装，请保留 `/var/lib/pingclair/certs`：证书和内部根都会存活，
信任该根的客户端也继续可用。若这台主机不再使用 Pingclair，就全部删掉，包括服务
账号：

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ 出问题时

- **装上了意料之外的版本。** 安装器总是取最新的 release tag。用
  `pingclair version` 确认；如果确实需要特定版本，用上面的回滚。
- **升级后服务起不来。** 读
  `sudo pingclair validate /etc/Pingclair/Pingclairfile`。新版本拒绝的指令会
  带着名字和替代方案 fail closed，journal 会指出要改哪一行。
- **容器立刻退出。** `docker logs <container>` 会说明原因。常见原因是挂载的配置
  目录里没有 `/etc/pingclair/Pingclairfile`，或者主机上端口已被占用。
- **重建存储后客户端拒绝证书。** 内部证书颁发机构重新生成后，旧根不再签任何
  东西。用 `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust`
  装新的根。

## 🧭 下一步

- [安装](/zh-CN/start/install/)：本页保留或删除的目录布局。
- [以服务方式运行](/zh-CN/start/service/)：升级会重写的 unit。
- [项目状态](/zh-CN/project/status/)：当前版本支持什么、拒绝什么。
