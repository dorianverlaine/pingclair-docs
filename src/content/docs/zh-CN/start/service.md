---
title: 以服务方式运行
h1_emoji: '🔁'
sidebar:
  order: 4
description: 安装出来的 systemd unit 到底做了什么、如何启动停止与重载、日志去哪里，以及配置出错时从外面看是什么样子。
---

安装器留下一个已启用、正在运行的 `systemd` unit。本页逐条读这个 unit，演示如何
操作它，并说明两种故障从外面看是什么样子：起不来的服务，以及运行中的服务器拒绝
新配置。

## 🧾 这个 unit 做了什么

```bash
systemctl cat pingclair
```

真正重要的键是这些：

```text
[Service]
Type=notify
NotifyAccess=main
User=pingclair
Group=pingclair
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment="RUST_LOG=info"
Environment="PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs"
ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -HUP $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=always
RestartSec=5s
LimitNOFILE=1048576
```

按顺序读：

- `Type=notify` 与 `NotifyAccess=main`：服务器在监听器绑定完成时通知
  `systemd`，所以 `systemctl start` 等到的是代理真的能应答，而不是进程存在。
- `User=pingclair` 加上 `AmbientCapabilities=CAP_NET_BIND_SERVICE`：服务以非特权
  用户运行，同时仍能绑定 80 和 443。
- `PINGCLAIR_TLS_STORE`：证书放在 `/var/lib/pingclair/certs`。服务账号没有主
  目录，交给二进制默认值会把存储指到一个不存在的 `$HOME`。
- `ExecStartPre` 每次启动前都会跑 `validate`。编译不过的配置永远到不了服务器。
- `ExecReload` 发送 `SIGHUP`：重载读取同一个文件，不重启进程。
- `Restart=always` 配合 `RestartSec=5s`：启动失败每五秒重试一次。这是最容易
  让人意外的一项，故障现象写在下面。

⚠️ `curl | bash` 这种安装方式写的是精简版 unit。仓库里的
`scripts/pingclair.service` 额外加了加固项（`ProtectSystem=full`、`PrivateTmp`、
`NoNewPrivileges`、`LimitNPROC`），并用了不同的重启策略
（`Restart=on-failure` 配合 `RestartPreventExitStatus=1`）。要换成更严格的
unit：

```bash
git clone https://github.com/dorianverlaine/pingclair
sudo cp pingclair/scripts/pingclair.service /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo systemctl restart pingclair
```

## 🎛️ 操作服务

`pc service` 就是这个 unit 的 `systemctl` 包装，两者可以互换：

| 目的 | 用 `pc` | 用 `systemctl` |
| --- | --- | --- |
| 启动 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 重启 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 重载配置 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 查看状态 | `pc service status` | `systemctl status pingclair` |
| 跟踪日志 | — | `journalctl -u pingclair -f` |

`pc service status` 显示的就是 unit 自己的视角，包括服务器上报的就绪行：

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
    Process: 1805 ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile (code=exited, status=0/SUCCESS)
   Main PID: 1808 (pingclair)
     Status: "Serving"
```

## 🔁 重载意味着什么

让改过的配置生效有两条路，它们在文件写坏时的表现不同。

`pc service reload` 发的是 `SIGHUP`，只要信号送达就报成功：

```text
✅ Service reloaded successfully
```

`pingclair reload` 走 Admin API，需要在全局选项块里写 `admin`。它会报告服务器
对文件的判断：

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

两种情况下，编译不过的配置都会让旧配置继续运行，所以站点照常应答：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/
```

```text
200
```

所以一定要先校验，把重载当成形式：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
```

例外是与整个进程有关的策略。像 `trusted_proxies` 这样在启动时确立的选项，只有
重启后才生效：`sudo pc service restart`。

## 📜 日志

unit 设置 `RUST_LOG=info`，把所有内容送进 journal：

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

启动、重载、证书工作，以及每个请求一行访问日志都会出现在那里：

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair_proxy::server: ♻️ Configuration reloaded successfully
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

想要独立的、带轮转的日志，就配置 `log` sink，写到安装器创建并交给服务用户的
`/var/log/pingclair` 下。

## ⚠️ 服务起不来时

- **`is-active` 一直显示 `activating`，`NRestarts` 不断上涨。** 这是安装出来的
  重启策略在起作用：`Restart=always` 每五秒重试，所以坏配置看起来不是一个
  「失败一次」的 unit，而是「永远不收敛」的 unit。调试前先停掉循环：
  `sudo systemctl stop pingclair`，改好文件，然后
  `sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。** `ExecStartPre` 拒绝了配置，编译器的原因在 journal 里，例如
  `Error: ❌ Configuration Error: Compile error: Unsupported feature: 'encode br': Brotli is not implemented for proxied responses; use 'encode zstd gzip'`。
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`。**
  存储属于服务账号。用 `sudo ls -ld /var/lib/pingclair/certs` 确认属主是
  `pingclair`。
- **`systemd-analyze verify` 对已安装的 unit 报 `Missing '=', ignoring line`。**
  一键安装写的精简版里混进了 shell 替换产生的多余行，`systemd` 会忽略它们。
  换成仓库里的 `scripts/pingclair.service` 就没有了。
- **unit 在跑但外面没有任何应答。** 监听器已绑定，请求没到达。和
  [安装](/zh-CN/start/install/) 一节一样，先查服务商防火墙，再查主机自身规则。

## 🧭 下一步

- [升级与卸载](/zh-CN/start/upgrade/)：重跑安装器会保留什么，以及如何全部拆掉。
- [HTTPS](/zh-CN/start/https/)：证书、存储位置，以及为什么 `pingclair trust`
  需要 `PINGCLAIR_TLS_STORE`。
- [`log`](/zh-CN/reference/directives/#log)：本页从 journal 里读到的访问日志
  输出目标。
