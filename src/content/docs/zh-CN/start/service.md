---
title: 以服务方式运行
h1_emoji: '🔁'
sidebar:
  order: 4
description: 安装好的 systemd unit 做了什么，如何启动、停止和重载它，日志在哪里，以及配置出错时从外部看到的是什么。
---

安装脚本留下了一个已启用且正在运行的 `systemd` unit。本页逐行解读这个 unit，演示如何操作它，
并说明两种失败从外部看起来是什么样子：服务器无法启动，以及运行中的服务器拒绝了新配置。

## 🧾 这个 unit 做了什么

```bash
systemctl cat pingclair
```

关键的配置项如下：

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

依次来看：

- `Type=notify` 与 `NotifyAccess=main`：服务器在监听绑定完成后通知 `systemd`，因此
  `systemctl start` 会一直等到代理能够响应才返回，而不是进程一出现就返回。
- `User=pingclair` 配合 `AmbientCapabilities=CAP_NET_BIND_SERVICE`：服务器以非特权用户运行，
  但仍能绑定 80 和 443 端口。
- 这里有意没有设置 `PINGCLAIR_TLS_STORE`。服务账户的主目录是 `/var/lib/pingclair`，所以证书位于
  `/var/lib/pingclair/.local/share/pingclair`：这是二进制文件自己的默认值，是安装脚本创建并迁移数据的目录，
  也是 `pingclair environ` 打印的路径。在这里再指定一个存储，等于给一个已有答案的问题提供第二个答案。
- 这里有意没有用 `ExecStartPre` 运行 `validate`。那里看起来是做检查的稳妥位置，却恰恰是个陷阱：
  `systemd` 只对主进程应用 `RestartPreventExitStatus=`，不对失败的前置命令应用，
  于是编译器拒绝的配置会每隔五秒重试一次，而不是让 unit 停在失败状态。服务器在绑定任何东西之前
  会自己编译文件，拒绝时以退出码 1 退出，上面的重启策略正是为这个退出码写的——
  `pingclair run` 就是为了充当这个进程而存在。
- `ExecReload` 发送 `SIGUSR1`，服务器把这个信号理解为“重新读取文件”。`SIGHUP` 被有意忽略；
  曾经有一个发送 `SIGHUP` 的 unit 报告成功，旧配置却仍在提供服务
  （[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。由于 `systemd`
  只能看到 `kill` 已经退出，服务器会把它对文件的处理结果发布到这个 unit 的状态行上——
  `Serving (reloaded 1 listener(s) in 323.341µs)` 或 `Reload rejected: …`——
  `systemctl status` 会显示出来。下文的[重载一节](#-重载意味着什么)有详细说明。
- `Restart=on-failure` 配合 `RestartPreventExitStatus=1` 和 `RestartSec=5s`：
  退出码 1 表示配置或证书存储完全无法使用，所以 unit 停在 `failed` 状态等待运维人员查看，
  而不是每五秒重试一次。其他任何失败都会重启。
- `ProtectSystem=full`、`PrivateTmp`、`NoNewPrivileges`、`LimitNPROC` 和 `LimitNOFILE`：
  服务器得到它需要的文件系统视图和进程限制，仅此而已。

两种安装方式写入的是同一个文件。一行命令安装会内嵌一份与 `scripts/pingclair.service`
逐字节相同的副本——两者不一致时 `just repo-lint` 会失败——所以全新的 `curl | bash`
安装和从代码仓库安装得到的是同一个 unit，而且无论哪种方式，
`systemd-analyze verify /etc/systemd/system/pingclair.service` 都不会对这个 unit 报告任何问题。

## 🎛️ 操作服务

`pc service` 为这个 unit 封装了 `systemctl`，两者可以互换：

| 任务 | 使用 `pc` | 使用 `systemctl` |
| --- | --- | --- |
| 启动 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 重载配置 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 重启（监听或进程级别的变更之后） | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 查看状态 | `pc service status` | `systemctl status pingclair` |
| 跟踪日志 | — | `journalctl -u pingclair -f` |

`pc service status` 打印 unit 自己的视图，包括服务器发送的就绪状态行：

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 05:57:21 UTC; 18s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
```

## 🔁 重载意味着什么

修改后的 `/etc/Pingclair/Pingclairfile` 通过一个信号送达运行中的服务器，有两条命令可以发送它。

`SIGUSR1` 就是重载信号，它本身不需要任何配置：

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload`——或者等价的 `sudo systemctl reload pingclair`——会替你发送这个信号。
unit 的 `ExecReload` 是 `/bin/kill -USR1 $MAINPID`，所以最直观的命令现在就是有效的命令；
曾经发送 `SIGHUP` 的 unit 报告成功却什么也没应用，
[issue #66](https://github.com/dorianverlaine/pingclair/issues/66) 记录的就是这件事。

`pingclair reload` 通过 Admin API 走到同一段代码，并报告服务器对文件的判断，
因此需要全局选项块中的 `admin` 选项：

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` 只能报告一件事：`kill` 已经把信号送达。服务器在此之后才读取文件，
所以它的结论写在 unit 的状态行和 journal 中。`pc service reload` 会如实说明这一点，
而不是声称配置已经应用：

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

如果运行中的服务器无法应用文件的要求，旧配置会继续提供服务，状态行会说明哪项变更被拒绝。
最常见的情况是把站点从 `:80` 移到 `:8080`，因为监听拓扑是在启动时随套接字一起建立的：

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

无论走哪条路径，无法编译的配置都会让之前的配置继续运行，站点照常响应。所以请先校验：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

例外是运行中的进程无法吸收的变更。在启动时确定的选项，例如 `trusted_proxies`，
只有重启后才会生效：`sudo pc service restart`。新增或移动监听的配置同样会被拒绝——
状态行会列出新增和移除的地址——因为重载应用的是策略，而不是新的监听套接字。

## 🛑 停止意味着什么

`systemctl stop` 发送 `SIGTERM`。在 v0.2.0-rc.3 中，进程大约四分之一秒后就会退出，
不论 `grace_period` 如何设置，所以此刻仍在处理的请求会被直接切断，得不到响应。
在可以接受短暂中断时再停止或重启；如果只改了站点配置，优先使用重载。

📌 **下一版本**：在 `main` 上，停止会先排空：`/ready` 返回 `503`，监听关闭，正在处理的请求继续完成，
进程在最后一个请求结束或 `grace_period`（默认 30 秒）到期时退出。

## 📜 日志

unit 设置了 `RUST_LOG=info`，所有输出都进入 journal：

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

启动、重载、证书操作以及每个请求的一行访问日志都会出现在那里：

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

被服务器拒绝的重载也以同样的方式记录，附带原因，并注明没有任何改变：

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

如果需要带轮转的独立日志文件，请配置一个 `log` 输出，写到 `/var/log/pingclair` 下；
安装脚本创建了这个目录，并把它交给了服务用户。

## ⚠️ 服务起不来时

- **`is-active` 显示 `activating`，`NRestarts` 不断增加。** 这个 unit 是旧版安装脚本写的，
  它有两处缺陷：一是使用 `Restart=always` 且没有 `RestartPreventExitStatus`，
  二是把 `validate` 作为 `ExecStartPre` 命令运行，而 `RestartPreventExitStatus` 管不到它——
  于是编译器拒绝的配置每五秒重试一次，看上去像一个始终稳定不下来的 unit，而不是一个已经失败的 unit。
  现在安装的 unit 使用 `Restart=on-failure` + `RestartPreventExitStatus=1`，也没有前置命令，
  被拒绝的启动会让 `is-active` 停在 `failed`，`NRestarts` 为零。在旧安装上，调试前先停下循环：
  `sudo systemctl stop pingclair`，修好文件，然后执行 `sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。** 服务器在绑定任何东西之前就拒绝了配置，编译器给出的原因在 journal 中，例如
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`。**
  存储属于服务账户。检查 `sudo ls -ld /var/lib/pingclair/.local/share/pingclair`，
  它的所有者应当是 `pingclair`。
- **`systemd-analyze verify` 对已安装的 unit 报告 `Missing '=', ignoring line`。**
  旧版一行命令安装写入的 unit 中，注释被 shell 展开成了 25 行 `--help` 输出，`systemd` 会忽略它们。
  用当前的安装脚本重新安装会原样写入 unit，这条报告也随之消失。
- **unit 在运行，却没有任何响应。** 监听已经绑定，但请求没有到达。
  和[安装页面](/zh-CN/start/install/)一样，先检查云服务商的防火墙，再检查主机的防火墙。

## 🧭 下一步

- [升级与卸载](/zh-CN/start/upgrade/)：重新运行安装脚本会保留什么，以及如何彻底移除。
- [HTTPS](/zh-CN/start/https/)：证书，包括存储的位置，以及为什么 `pingclair trust` 需要
  `PINGCLAIR_TLS_STORE`。
- [`log`](/zh-CN/reference/directives/#log)：本页从 journal 中读到的访问日志所对应的输出。
