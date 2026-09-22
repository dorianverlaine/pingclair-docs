---
title: 命令行
h1_emoji: '⌨️'
description: 二进制暴露的每个子命令，连同选项、默认值和前置条件，都对照 `pingclair --help` 核对过。
---

Pingclair 以一个二进制发布，命令行遵循 Unix 的惯例：

```bash
pingclair <command> [<args…>]
```

尖括号是必填，方括号是选填，`…` 表示可以重复。每个命令的 `--help` 返回的就是
写这一页所用的同一份文本，`pingclair help <command>` 打印的也是它。不带命令运行
会列出全部命令。

安装器还把二进制链接为 `pc`，所以下面每条命令都有两个字母的写法：`pc validate`、
`pc service reload` 等等。两者是同一个程序，`pc` 是符号链接，不是第二个二进制。

## 🚩 全局选项

| 选项 | 作用 |
| --- | --- |
| `-v`, `--verbose` | 把本次运行的日志级别提到 `debug`。放在命令前后都可以。 |
| `-h`, `--help` | 打印它所附着的那个命令的帮助。 |
| `-V`, `--version` | 打印版本。仅限顶层。 |

## 🧭 命令一览

| 命令 | 作用 |
| --- | --- |
| `run` | 在前台运行服务器。 |
| `reload` | 通过 Admin API 应用改过的配置，并报告服务器对它的判断。 |
| `start` | 启动一份脱离终端的服务器副本。 |
| `stop` | 通过 Admin API 停止正在运行的服务器。 |
| `completion` | 打印某个 shell 的补全脚本。 |
| `environ` | 打印服务器将看到的环境。 |
| `list-modules` | 列出编译进这个二进制的模块。 |
| `build-info` | 打印构建信息，包括工具链。 |
| `manpage` | 把 man 手册写进一个目录。 |
| `storage-export` | 把证书存储放进一个 tar 归档。 |
| `storage-import` | 从该归档恢复证书存储。 |
| `trust` | 把内部 CA 根证书装进系统信任存储。 |
| `untrust` | 再把它移除。 |
| `respond` | 开发时返回固定响应。 |
| `reverse-proxy` | 不写配置文件就代理到上游。 |
| `file-server` | 不写配置文件就提供目录。 |
| `validate` | 编译配置并说明哪里不对。 |
| `adapt` | 打印 Pingclairfile 编译出的 JSON。 |
| `fmt` | 格式化 Pingclairfile，或显示格式化会改动什么。 |
| `hash-password` | 为 `basic_auth` 生成密码哈希。 |
| `version` | 打印版本。 |
| `service` | 操作安装出来的 systemd unit。 |

## pingclair run

用一份配置文档在前台运行服务器。日志走标准输出与标准错误，`Ctrl-C` 停止服务器。

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要加载的配置文件或目录。 |

| 选项 | 作用 |
| --- | --- |
| `-r`, `--resume` | 像 `caddy run --resume` 那样，加载 Admin API 最后一次自动保存的配置。两者同时存在时覆盖 `CONFIG`。 |
| `-w`, `--watch` | 监视配置文件（每秒轮询 mtime），每次改动后给进程发重载信号。面向本地开发：被拒绝的编辑很快就能看见。 |

```bash
pingclair run --watch
```

要让服务器活过终端，请用安装出来的 unit（[作为服务运行](/zh-CN/start/service/)）或
[快速开始](/zh-CN/start/quickstart/)，后者把同一条命令按服务的方式讲一遍。

## pingclair reload

通过 Admin API 把改过的配置应用到正在运行的服务器。应答请求的是服务器本身，
所以这条命令会报告它对文件的判断——信号做不到这一点，systemd 只能确认信号已
送达。

```bash
pingclair reload [OPTIONS]
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要应用的配置文件。 |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 地址。 |

Admin API 必须开着：全局选项 `admin` 启用它，而没有该选项的配置没有任何端点可
达。正在运行的服务器无法应用的重载——改动监听器拓扑是最常见的情形——会让旧配置
继续服务。

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

启动一份在 shell 退出后仍继续运行的服务器副本，不涉及服务管理器。

```bash
pingclair start [OPTIONS]
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要加载的配置文件。 |

进程会脱离终端，输出被丢弃，因此任何地方都没有日志。在有 systemd 的主机上，安装
出来的 unit 是更好的工具：它捕获日志、失败时重启，并且知道监听器何时绑定完成。
见[作为服务运行](/zh-CN/start/service/)。

## pingclair stop

通过 Admin API 停止正在运行的服务器——就是 Admin API 暴露的 `POST /stop`。和
`reload` 一样需要 `admin` 选项。

```bash
pingclair stop [OPTIONS]
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 地址。 |

## pingclair completion

打印某个 shell 的补全脚本。可接受的名字与参数接受的完全一致：`bash`、`zsh`、
`fish`、`powershell`、`elvish`。

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

打印服务器将要运行的环境，这样 `PINGCLAIR_TLS_STORE` 之类的值可以在启动前确认，
而不是在启动后从失败里反推。

```bash
pingclair environ
```

## pingclair list-modules

列出编译进这个二进制的模块与功能。`--json` 把同一份列表输出成结构化形式，供脚本
使用。

```bash
pingclair list-modules [--json]
```

## pingclair build-info

打印构建信息：版本、目标，以及产出这个二进制的工具链。报缺陷时有用，因为它指明
了确切的构建。

```bash
pingclair build-info
```

## pingclair manpage

把 man 手册写进一个必须已存在的目录。该选项是必填的，所以不会意外写进当前目录。

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

把 `PINGCLAIR_TLS_STORE` 指定的证书存储写进 tar 归档。输出路径写 `-` 则写到标准
输出。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-export -o /tmp/store.tar
```

归档里有私钥，所以它以 `600` 权限写入，并且该放在加密介质上，而不是随备份进
bucket。[TLS 指南](/zh-CN/guides/tls-tuning/) 说明了它装了什么、什么时候该搬。

## pingclair storage-import

从 `storage-export` 写出的归档恢复存储。`-` 表示从标准输入读归档。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

把内部 CA 根证书装进系统信任存储，此后浏览器和命令行客户端都会接受该 CA 签发的
证书。CA 从 `PINGCLAIR_TLS_STORE` 指定的存储里读取。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust
```

什么时候需要它、怎么确认生效，见 [HTTPS](/zh-CN/start/https/)。

## pingclair untrust

再把这个根证书从系统信任存储移除。已经签发的证书文件还在，客户端不再信任它们。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair untrust
```

## pingclair respond

返回一个固定响应——状态、响应头、正文——用于开发和对着一个永远同样应答的上游测试
客户端。

```bash
pingclair respond [OPTIONS]
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | 要返回的状态码。 |
| `-H`, `--header <HEADERS>` | 无 | `Field: value` 形式的响应头。可重复。 |
| `-b`, `--body <BODY>` | 空 | 响应正文。 |
| `-l`, `--listen <LISTEN>` | 随机回环端口 | 监听地址。 |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

不给 `--listen` 时端口由工具挑选并打印出来，这样两个开发服务器不会抢同一个固定
端口。

## pingclair reverse-proxy

不写配置文件，直接从监听地址代理到一个或多个上游。这是
[反向代理指南](/zh-CN/guides/reverse-proxy/)的一行版本，提供的是生产形态的配置
而不是玩具：上游是必填的，多个 `--to` 会做负载均衡。

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 监听地址。 |
| `--to <TO>` | 必填 | 上游地址。可重复指定多个。 |
| `--header-up <HEADERS_UP>` | 无 | 发往上游的请求头（`Field: value`）。可重复。 |
| `--header-down <HEADERS_DOWN>` | 无 | 发往下游的响应头（`Field: value`）。可重复。 |
| `--insecure` | 关 | 上游证书不匹配时跳过 TLS 校验。 |
| `--internal-certs` | 关 | 这个监听器的证书由内部 CA 签发，而不去申请公开证书。 |
| `--disable-redirects` | 关 | 不准备 HTTP 到 HTTPS 的重定向监听器。 |
| `-c`, `--change-host-header` | 关 | 像 Caddy 那样，把上游的 `Host` 头改写成上游地址。 |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

不写配置文件，直接把目录用 HTTP 提供出去。

```bash
pingclair file-server [OPTIONS]
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 监听地址。 |
| `--root <ROOT>` | `.` | 要提供的目录。 |
| `-b`, `--browse` | 关 | 显示目录列表。 |
| `-d`, `--domain <DOMAIN>` | 无 | 用 HTTPS 提供这个域名；要求 `--listen` 是端口。 |
| `--access-log` | 关 | 每个请求写一行访问日志。 |
| `--no-compress` | 关 | 关闭响应压缩。 |
| `--file-limit <FILE_LIMIT>` | 无 | 目录列表里显示的文件数上限。 |
| `--templates` | 关 | 像 Caddy 那样把 `.html` 当模板渲染。 |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

压缩、缓存头和单页应用回退属于配置文件，
[静态站点指南](/zh-CN/guides/static-site/)讲了这些。

## pingclair validate

编译配置并报出第一个问题，什么都不启动。配置被拒绝时退出码非零，所以它能用在
流水线或部署脚本里。

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要检查的配置文件或目录。 |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

打印配置编译出的 JSON 形式。`--pretty` 缩进便于阅读，`--validate` 会连需要动文件
系统的检查——例如证书路径——一起跑，而不只是语法。

```bash
pingclair adapt [OPTIONS]
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要读取的配置文件。 |
| `-p`, `--pretty` | 关 | 缩进 JSON。 |
| `--validate` | 关 | 同时校验转换后文档引用的东西。 |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

格式化 Pingclairfile 并打印结果。不给路径时读 `./Pingclairfile`，`-` 读标准输入。

```bash
pingclair fmt [OPTIONS] [PATH]
```

| 选项 | 作用 |
| --- | --- |
| `-o`, `--overwrite` | 把格式化后的文本写回文件，而不是打印。 |
| `-d`, `--diff` | 打印可视化差异，而不是格式化后的文件。 |

```bash
pingclair fmt --diff              # 会改什么
pingclair fmt --overwrite         # 应用它
```

## pingclair hash-password

为 `basic_auth` 指令生成密码哈希。省略 `--plaintext` 时从标准输入读密码，这样它
不会留在 shell 历史里。

```bash
pingclair hash-password [OPTIONS]
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | 从标准输入读 | 要哈希的密码。 |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` 或 `argon2id`。 |
| `--bcrypt-cost <COST>` | `14` | bcrypt 代价，4 到 31。越高越慢也越强。 |
| `--argon2id-time <TIME>` | `1` | argon2id 迭代次数。 |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id 内存代价，单位 KiB。 |
| `--argon2id-threads <THREADS>` | `4` | argon2id 并行度。 |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id 输出长度，单位字节。 |

```bash
pingclair hash-password --algorithm argon2id
```

把输出贴进指令里；周边语法见
[`basic_auth`](/zh-CN/reference/directives/#basic_auth)。

## pingclair version

打印版本，发布候选会像 `v0.2.0-rc.3`。

```bash
pingclair version
```

## pingclair service

管理安装器写出的 systemd unit。它包装 `systemctl`，两者可以互换；存在的意义是让
操作 unit 的命令和其余命令待在同一处。

```bash
pingclair service <start|stop|restart|reload|status>
```

| 子命令 | 作用 |
| --- | --- |
| `start` | 启动 unit。 |
| `stop` | 停止 unit。 |
| `restart` | 重启 unit，改动监听器或进程级选项后需要它。 |
| `reload` | 用信号请正在运行的服务器重新读取配置文件。结果在 unit 的 status line 和日志里，不在这条命令的退出码里。 |
| `status` | 打印 unit 状态。 |

仅限带 systemd 的 Linux。其他平台这条命令会直接拒绝而不是假装可以；unit 本身的
说明在[作为服务运行](/zh-CN/start/service/)。

## 🧾 这些选项的出处

命令行定义在服务端源码的一个文件里，`pingclair/src/cli/mod.rs`，上面的页面按它的
顺序排列。每个 `--help` 屏幕显示的版本与本页核对所用的版本是同一个；命令的选项
变了，这一页也跟着变。
