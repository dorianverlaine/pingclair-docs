---
title: 升级与卸载
h1_emoji: '🧹'
sidebar:
  order: 5
description: 重新运行安装脚本完成升级，固定容器标签，回滚到旧版本，以及在不丢失值得保留的数据的前提下彻底移除。
---

升级只替换两样东西——二进制文件和服务 unit——你的配置和证书都保持不动。本页演示这一点，
以及容器中的对应做法、必须退回旧版本时的回滚路径，还有卸载。

## 🧾 什么能扛过什么

| 路径 | 升级时 |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | 保留。安装脚本只在它不存在时才写入。 |
| `/etc/Pingclair/Pingclairfile.example` | 替换为当前版本的示例。 |
| `/var/lib/pingclair/.local/share/pingclair` | 保留。已签发的证书和 ACME 状态原地不动。 |
| `/var/lib/pingclair/html` | 保留。 |
| `/usr/local/bin/pingclair` 和 `pc` | 替换为新版本。 |
| `/etc/systemd/system/pingclair.service` | 重新写入，随后重启服务。 |

## ⬆️ 用安装脚本升级

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

脚本在发布渠道上找到最新版本，打印版本标签，校验压缩包的 SHA-256，替换二进制文件和 unit，
然后重启服务。无法连接发布渠道的主机时，它会改为查询 GitHub releases API；下面这次运行走的就是这条路径，
所以输出里有 `Fetching latest release`。已经存在的配置文件不会被改动，正因如此，这是一次升级而不是重置：

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

安装脚本总是安装最新版本，没有用来安装指定版本的参数；需要指定版本时，请使用下文的回滚方法。

## ⚠️ 升级到 0.2.0 之前先读升级说明

下一版本会改变一些即使配置不变也能察觉到的行为：由哪条路由响应请求、没有 `encode` 的站点是否压缩、
请求体的默认大小上限、`remote_ip` 匹配的是什么，以及内部证书颁发机构把根证书放在哪里。
[项目状态](/zh-CN/project/status/#-下一版本有哪些变化)对这些变化做了汇总，
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) 为每一项都附有升级说明。
在用新的二进制文件重启服务之前，先用它校验你的配置。

## 🐳 升级容器

主机上没有安装任何东西，所以升级就是改一个标签再拉取一次。在 compose 文件中固定新版本：

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

配置和证书存储都在卷中，所以新容器会在旧容器留下它们的地方找到它们。有两点需要注意：

- **systemd 服务运行时，映射 80 端口的容器无法启动。** 停掉其中一个：`sudo pc service stop`，
  或者修改容器发布的端口。
- **`latest` 会跟随最新版本。** 生产环境请固定版本，让升级成为一个决定，而不是拉取镜像的副作用。

## ⏪ 回滚到旧版本

当新版本必须撤下时，从发布主机获取上一个版本，用该版本公布的摘要校验它，再替换二进制文件：

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

然后用回滚后的版本校验配置，因为旧版本未实现的指令会被点名拒绝，而不是被忽略：

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

完成之后，`systemctl status pingclair` 会回答 `Unit pingclair.service could not be found`，
命令已经消失，80 端口上也没有任何监听。磁盘上剩下的是你的数据，这是有意为之：

```text
/etc/Pingclair/Pingclairfile      the configuration, still valid
/var/lib/pingclair/.local/share/pingclair          issued certificates and ACME state
/var/lib/pingclair/html           the placeholder site
/var/log/pingclair                a log sink's directory
```

如果打算重新安装，请保留 `/var/lib/pingclair/.local/share/pingclair`：证书和内部根证书都会保留下来，
信任该根证书的客户端也能继续正常工作。当这台主机不再使用 Pingclair 时，删除所有内容，包括服务账户：

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ 出问题时

- **安装脚本装的版本和你预期的不一样。** 它总是选择最新的版本标签。用 `pingclair version` 确认；
  如果需要特定版本，请使用上面的回滚方法。
- **升级后服务无法启动。** 查看 `sudo pingclair validate /etc/Pingclair/Pingclairfile` 的输出。
  新版本拒绝的指令会以失败关闭的方式报错，给出指令名称和替代方案，所以 journal 会指出需要修改的那一行。
- **容器立即退出。** `docker logs <container>` 会给出原因。常见原因是挂载的配置目录中缺少
  `/etc/pingclair/Pingclairfile`，或者主机上的端口已被占用。
- **重建存储后客户端拒绝证书。** 如果内部证书颁发机构被重新生成，旧的根证书就不再为任何证书签名。
  用 `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust`
  安装新的根证书。

## 🧭 下一步

- [安装](/zh-CN/start/install/)：本页保留或移除的目录布局。
- [以服务方式运行](/zh-CN/start/service/)：升级时被重写的 unit。
- [项目状态](/zh-CN/project/status/)：当前版本支持什么、拒绝什么。
