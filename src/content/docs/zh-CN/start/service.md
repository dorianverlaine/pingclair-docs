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
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -USR1 $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=on-failure
RestartPreventExitStatus=1
RestartSec=5s
LimitNOFILE=1048576
LimitNPROC=512
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true
```

按顺序读：

- `Type=notify` 与 `NotifyAccess=main`：服务器在监听器绑定完成时通知
  `systemd`，所以 `systemctl start` 等到的是代理真的能应答，而不是进程存在。
- `User=pingclair` 加上 `AmbientCapabilities=CAP_NET_BIND_SERVICE`：服务以非特权
  用户运行，同时仍能绑定 80 和 443。
- 这里刻意不写 `PINGCLAIR_TLS_STORE`。服务账号的 home 是 `/var/lib/pingclair`，
  所以证书放在 `/var/lib/pingclair/.local/share/pingclair`：二进制自己的默认值、
  安装器创建并迁移的目录，也是 `pingclair environ` 打印的路径。在这里另写一个
  存储路径，等于给已经有答案的问题再答一次。
- 这里刻意不写 `ExecStartPre` 去跑 `validate`。那看起来是放检查的安全位置，恰恰
  也是陷阱：`systemd` 的 `RestartPreventExitStatus=` 作用于主进程，不作用于失败
  的前置命令，所以编译器拒绝的配置会每五秒被重试一次，而不是让 unit 停在
  failed。服务器自己在绑定任何东西之前编译文件，拒绝时以退出码 1 结束——这正是
  上面的重启策略为之而写的退出码，`pingclair run` 的存在就是为了成为那个进程。
- `ExecReload` 发送 `SIGUSR1`，也就是服务器理解为「重新读文件」的信号。`SIGHUP`
  被刻意忽略，而过去发送它的 unit 会在旧配置继续服务的同时报成功
  （[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。
  `systemd` 只能观察到 `kill` 退出了，所以服务器把对文件的判断发布到 unit 的
  status line 上——`Serving (reloaded 1 listener(s) in 323.341µs)`，或者
  `Reload rejected: …`——`systemctl status` 会显示它。下面的
  [重载意味着什么](#-重载意味着什么) 是详细版本。
- `Restart=on-failure` 配合 `RestartPreventExitStatus=1` 和 `RestartSec=5s`：
  退出码 1 意味着配置或证书存储根本用不了，所以 unit 会停在 `failed` 等运维
  人员来看，而不是每五秒重试一次。其他失败会重启。
- `ProtectSystem=full`、`PrivateTmp`、`NoNewPrivileges`、`LimitNPROC`、
  `LimitNOFILE`：服务器只拿到它需要的文件系统视野和进程上限，不多拿。

两条安装路径写的是同一个文件。一行安装内嵌了 `scripts/pingclair.service` 的
逐字节副本——两者一旦分叉 `just repo-lint` 就会失败——所以全新的 `curl | bash`
安装和从仓库安装产出同一个 unit；两条路径下 `systemd-analyze verify
/etc/systemd/system/pingclair.service` 都不会就这个 unit 说任何话。

## 🎛️ 操作服务

`pc service` 就是这个 unit 的 `systemctl` 包装，两者可以互换：

| 目的 | 用 `pc` | 用 `systemctl` |
| --- | --- | --- |
| 启动 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 重载配置 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 改动监听器或进程级设置后重启 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 查看状态 | `pc service status` | `systemctl status pingclair` |
| 跟踪日志 | — | `journalctl -u pingclair -f` |

`pc service status` 显示的就是 unit 自己的视角，包括服务器上报的就绪行：

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
       Docs: https://pingclair.com/start/service/
   Main PID: 1808 (pingclair)
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

## 🔁 重载意味着什么

改过的 `/etc/Pingclair/Pingclairfile` 通过一个信号到达正在运行的服务器，发送它
的有两条命令。

`SIGUSR1` 是重载信号，本身不需要任何配置：

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload`——或者同一次调用的 `sudo systemctl reload pingclair`——替你
发送这个信号。unit 的 `ExecReload` 是 `/bin/kill -USR1 $MAINPID`，那条理所当然的
命令现在就是能用的命令。过去发送 `SIGHUP` 的 unit 报成功却什么都不应用，这一点
记录在 [issue #66](https://github.com/dorianverlaine/pingclair/issues/66)。

`pingclair reload` 通过 Admin API 走到同一段代码，并报告服务器对文件的判断，
需要在全局选项块里写 `admin`：

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` 只能报告一件事：`kill` 把信号送到了。服务器是在那之后才读
文件的，所以它的判断落在 unit 的 status line 和日志里。`pc service reload` 就
这么说，而不是声称配置已经生效：

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

运行中的服务器无法应用文件所要求的内容时，旧配置会继续服务，status line 会指出
被拒的是哪一处改动。把站点从 `:80` 挪到 `:8080` 是最常见的情形，因为监听器拓扑
是启动时连套接字一起建的：

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

无论走哪条路，编译不过的配置都会让旧配置继续运行。先校验：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

例外是与整个进程有关的策略。像 `trusted_proxies` 这样在启动时确立的选项，只有
重启后才生效：`sudo pc service restart`。改动监听器的配置也会被同样地拒绝——
status line 会列出新增和移除的地址——因为重载应用的是策略，不是新的监听
套接字。

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
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 📋 Step 1/3: Validating configuration...
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

服务器拒绝的重载也以同样的方式记录，带上原因和「什么都没变」的说明：

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

想要独立的、带轮转的日志，就配置 `log` sink，写到安装器创建并交给服务用户的
`/var/log/pingclair` 下。

## ⚠️ 服务起不来时

- **`is-active` 一直显示 `activating`，`NRestarts` 不断上涨。** 这是安装出来的
  旧 unit 已经退役的行为：它带着 `Restart=always` 却没有
  `RestartPreventExitStatus`，所以服务器拒绝的配置每五秒被重试一次，看起来不是
  一个「失败一次」的 unit，而是「永远不收敛」的 unit。还有第二个原因：它把
  `validate` 当作 `ExecStartPre` 跑，而 `RestartPreventExitStatus` 不覆盖它。
  现在安装出来的 unit 带 `Restart=on-failure` + `RestartPreventExitStatus=1`，
  没有前置命令，被拒绝的启动会让 `is-active` 停在 `failed`、`NRestarts` 停在
  0。在旧安装上，调试前先停掉循环：`sudo systemctl stop pingclair`，改好文件，
  然后 `sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。** 服务器在绑定任何东西之前拒绝了配置，编译器的原因在 journal
  里，例如
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`。**
  存储属于服务账号。用 `sudo ls -ld /var/lib/pingclair/.local/share/pingclair` 确认属主是
  `pingclair`。
- **`systemd-analyze verify` 对已安装的 unit 报 `Missing '=', ignoring line`。**
  旧的一键安装写出的 unit 里，注释被 shell 展开过——25 行 `--help` 输出，
  `systemd` 会忽略它们。用当前安装器重装会把 unit 原样写入，这条报告就消失了。
- **unit 在跑但外面没有任何应答。** 监听器已绑定，请求没到达。和
  [安装](/zh-CN/start/install/) 一节一样，先查服务商防火墙，再查主机自身规则。

## 🧭 下一步

- [升级与卸载](/zh-CN/start/upgrade/)：重跑安装器会保留什么，以及如何全部拆掉。
- [HTTPS](/zh-CN/start/https/)：证书、存储位置，以及为什么 `pingclair trust`
  需要 `PINGCLAIR_TLS_STORE`。
- [`log`](/zh-CN/reference/directives/#log)：本页从 journal 里读到的访问日志
  输出目标。
