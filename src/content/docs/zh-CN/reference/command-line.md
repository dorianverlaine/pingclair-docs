---
title: 命令行
h1_emoji: '⌨️'
description: pingclair 的每个子命令及其参数、默认值和前提条件，均已对照二进制文件自身的 --help 输出核对。
---

Pingclair 只有一个二进制文件。从运行服务器到检查配置，每项任务都是它的一个子命令：

```bash
pingclair <command> [<args…>]
```

尖括号表示必填值，方括号表示可选值，`…` 表示可以重复的值。每个命令都支持 `--help`，
`pingclair help <command>` 打印的是同样的内容。不带命令运行二进制文件会打印命令列表。

📌 本页描述的是最新发布的版本 **v0.2.0-rc.3**。仅存在于服务器 `main` 分支上的变化标记为 **下一版本**。

安装脚本还把二进制文件链接为 `pc`，所以下面的每个命令都有两个字母的简写：`pc validate`、
`pc service reload` 等等。两者是同一个程序：`pc` 是符号链接，而不是第二个二进制文件。

## 🚩 全局参数

| 参数 | 作用 |
| --- | --- |
| `-v`、`--verbose` | 把本次运行的日志级别提高到 `debug`。可以写在命令之前或之后。与 `caddy -v` 不同，它不会打印版本。 |
| `-h`、`--help` | 打印所附命令的帮助。 |
| `-V`、`--version` | 打印版本。仅限顶层使用。 |

## 🧭 命令一览

| 命令 | 作用 |
| --- | --- |
| `run` | 在前台运行服务器。 |
| `reload` | 通过 Admin API 应用修改后的配置，并报告服务器对它的判断。 |
| `start` | 启动一个脱离终端的服务器副本。 |
| `stop` | 通过 Admin API 停止运行中的服务器。 |
| `completion` | 打印 shell 补全脚本。 |
| `environ` | 打印服务器将会看到的环境变量。 |
| `list-modules` | 列出编译进这个二进制文件的模块。 |
| `build-info` | 打印构建元数据，包括工具链。 |
| `manpage` | 把 man 手册页写入一个目录。 |
| `storage-export` | 把证书存储写入 tar 归档。 |
| `storage-import` | 从该 tar 归档恢复证书存储。 |
| `trust` | 把内部 CA 根证书安装到系统信任库。 |
| `untrust` | 再把它移除。 |
| `respond` | 提供固定响应，用于开发。 |
| `reverse-proxy` | 无需配置文件，直接反向代理到上游。 |
| `file-server` | 无需配置文件，直接提供一个目录。 |
| `validate` | 编译配置并报告其中的问题。 |
| `adapt` | 打印 Pingclairfile 编译后的 JSON 形式。 |
| `fmt` | 格式化 Pingclairfile，或者显示格式化会改动什么。 |
| `hash-password` | 为 `basic_auth` 生成密码哈希。 |
| `version` | 打印版本。 |
| `service` | 控制已安装的 systemd unit。 |

**下一版本**：新增 `storage export` 和 `storage import`，作为 `storage-export` 和 `storage-import`
的 Caddy 写法。带连字符的名称继续可用。

## pingclair run

用一份配置文档在前台运行服务器。日志输出到标准输出和标准错误，按 `Ctrl-C` 关闭服务器。

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要加载的配置文件或目录。 |

| 参数 | 作用 |
| --- | --- |
| `-r`、`--resume` | 加载 Admin API 最近一次自动保存的配置，而不是文件，与 `caddy run --resume` 的做法相同。两者同时存在时，它优先于 `CONFIG`。 |
| `-w`、`--watch` | 每秒检查一次配置文件的修改时间，每次变化后都重载。用于本地开发。 |

```bash
pingclair run --watch
```

没有 `CONFIG`、两个默认文件也都不存在时，`run` 以状态码 1 退出。Caddy 在这种情况下会启动一个空服务器；
Pingclair 则拒绝运行，所以在错误目录下敲的 `run` 会明明白白地失败。

如果需要一个在终端关闭后继续运行的服务器，请使用已安装的 unit（[以服务方式运行](/zh-CN/start/service/)）。

## pingclair reload

通过 Admin API（`POST /load`）把配置文件发送给运行中的服务器。请求由服务器本身响应，
所以这个命令能报告文件是否已被应用。信号做不到这一点：systemd 只能确认信号已经送达。

```bash
pingclair reload [OPTIONS]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要应用的配置文件。 |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 地址。 |

运行中的配置必须用全局选项 `admin` 开启 Admin API；没有它，就没有可以连接的对象。
当服务器无法应用新文件时（最常见的原因是新增或移动了监听），命令会失败，之前的配置继续提供服务。

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

不借助服务管理器，把服务器作为后台进程启动，shell 退出后它继续运行。

```bash
pingclair start [OPTIONS]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要加载的配置文件。 |

进程脱离终端，输出被丢弃，所以它的日志不会保存在任何地方。在有 systemd 的主机上，已安装的 unit 是更好的工具：
它会收集日志、在失败时重启，并且知道监听何时绑定完成。参见[以服务方式运行](/zh-CN/start/service/)。

## pingclair stop

通过 Admin API 的 `POST /stop` 停止运行中的服务器。和 `reload` 一样，它需要运行中的配置里有 `admin` 选项。

```bash
pingclair stop [OPTIONS]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 地址。 |

## pingclair completion

为某一种 shell 打印补全脚本。支持的名称正是该参数接受的那些：`bash`、`zsh`、`fish`、`powershell`、`elvish`。

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

打印本进程继承的环境变量，每行一个 `NAME=value`，便于在启动前检查 `PINGCLAIR_TLS_STORE` 之类的值。
与 `caddy environ` 不同，它不会打印服务器计算出的路径。

```bash
pingclair environ
```

## pingclair list-modules

列出编译进这个二进制文件的模块。`--json` 以 JSON 格式打印同样的列表，供脚本使用。

**下一版本**：接受 `--versions`、`--packages` 和 `-s`/`--skip-standard`，
所以为 `caddy list-modules` 编写的脚本无需修改即可运行。

```bash
pingclair list-modules [--json]
```

## pingclair build-info

打印构建元数据：版本、目标平台，以及构建该二进制文件的工具链。报告缺陷时很有用，因为它能指明确切的构建。

```bash
pingclair build-info
```

## pingclair manpage

把 man 手册页写入一个必须已经存在的目录。该参数是必填的，所以不会意外地把文件写到当前目录。

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

把证书存储写入 tar 归档。存储由 `PINGCLAIR_TLS_STORE` 指定，否则就是运行该命令的用户的数据目录。
示例中的前缀让 root shell 指向服务账户的存储，而不是 root 自己的。`-o -` 把归档写到标准输出。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

归档中包含私钥，所以以 `600` 权限写入，应当存放在加密介质上，而不是放进会传到存储桶的备份里。
[TLS 指南](/zh-CN/guides/tls-tuning/)介绍了它包含哪些内容，以及何时需要迁移它。

## pingclair storage-import

从 `storage-export` 写出的归档恢复存储。`-i -` 从标准输入读取归档。

**下一版本**：两个命令都接受 `-c`/`--config <file>`，该文件中的全局选项
`storage file_system <path>` 可以指定存储位置。不会恢复任何内容的导入会被拒绝。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

把内部证书颁发机构（`tls internal`）的根证书安装到系统信任库。此后，使用该信任库的客户端会接受
这个颁发机构签发的证书。根证书从 `PINGCLAIR_TLS_STORE` 指定的存储中读取。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

[HTTPS](/zh-CN/start/https/) 页面介绍了什么时候需要这样做，以及如何确认它已生效。

## pingclair untrust

从系统信任库中移除该根证书。已签发的证书仍保留在磁盘上，但客户端不再信任它们。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

对每个请求都返回同一个固定响应（状态码、头部和响应体）。它用于开发，
也可用于针对一个始终以相同方式响应的源站测试客户端。

```bash
pingclair respond [OPTIONS]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `-s`、`--status <STATUS>` | `200` | 要返回的状态码。 |
| `-H`、`--header <HEADERS>` | 无 | 以 `Field: value` 形式给出的响应头部。可重复。 |
| `-b`、`--body <BODY>` | 空 | 响应体。 |
| `-l`、`--listen <LISTEN>` | 随机的回环端口 | 监听地址。 |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

不写 `--listen` 时，会选择并打印一个空闲的回环端口，所以两个开发服务器永远不会争抢同一个端口。

## pingclair reverse-proxy

无需配置文件，把一个监听反向代理到一个或多个上游。`--to` 是必填的；重复使用它可以把请求分摊到多个上游。
[反向代理指南](/zh-CN/guides/reverse-proxy/)用配置文件介绍了同样的内容。

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 监听地址。 |
| `--to <TO>` | 必填 | 上游地址。多个上游时重复使用。 |
| `--header-up <HEADERS_UP>` | 无 | 发往上游的请求头部，形式为 `Field: value`。可重复。 |
| `--header-down <HEADERS_DOWN>` | 无 | 发往下游的响应头部，形式为 `Field: value`。可重复。 |
| `--insecure` | 关闭 | 不验证上游的 TLS 证书。 |
| `--internal-certs` | 关闭 | 由内部 CA 为这个监听签发证书，而不是尝试申请公网证书。 |
| `--disable-redirects` | 关闭 | 不创建 HTTP 到 HTTPS 的重定向监听。 |
| `-c`、`--change-host-header` | 关闭 | 像 Caddy 那样，把发往上游的 `Host` 头部改写为上游地址。 |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

无需配置文件，通过 HTTP 提供一个目录。

```bash
pingclair file-server [OPTIONS]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 监听地址。 |
| `--root <ROOT>` | `.` | 要提供的目录。 |
| `-b`、`--browse` | 关闭 | 显示目录列表。 |
| `-d`、`--domain <DOMAIN>` | 无 | 通过 HTTPS 提供该域名；要求 `--listen` 是一个端口。 |
| `--access-log` | 关闭 | 每个请求写一行访问日志。 |
| `--no-compress` | 关闭 | 禁用响应压缩。 |
| `--file-limit <FILE_LIMIT>` | 无 | 目录列表中显示的最大文件数。 |
| `--templates` | 关闭 | 像 Caddy 那样把 `.html` 文件作为模板渲染。 |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

压缩、缓存头部和单页应用回退应当写在配置文件中；[静态站点指南](/zh-CN/guides/static-site/)介绍了这些内容。

## pingclair validate

编译配置并报告发现的第一个问题，不启动任何东西。配置被拒绝时退出状态非零，
所以这个命令可以作为部署脚本中的关卡。

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要检查的配置文件或目录。 |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

打印 Pingclairfile 编译后的 JSON 文档。这是 Pingclair 自己的模式，也就是 `validate`、`run`
和 Admin API 的 `/load` 所接受的格式。与 `caddy adapt` 不同，输出不是 Caddy 的 `{"apps": …}` 结构，
Caddy 也无法加载它。

`--pretty` 让 JSON 带缩进。`--validate` 还会执行 `validate` 所做的检查，例如证书文件是否存在。

**下一版本**：`adapt` 总是在打印之前先校验，所以退出状态为 0 就意味着这个构建能够加载结果。
`--validate` 仍然接受，但不再改变任何行为。

```bash
pingclair adapt [OPTIONS]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要读取的配置文件。 |
| `-p`、`--pretty` | 关闭 | 让 JSON 带缩进。 |
| `--validate` | 关闭 | 同时执行 `validate` 所做的检查。 |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

格式化 Pingclairfile 并打印结果。不带路径时读取 `./Pingclairfile`；`-` 表示从标准输入读取。

**下一版本**：输入原本未格式化时，`fmt` 以状态码 1 退出，因此可以像 `caddy fmt` 那样把关提交；
`--overwrite` 仍以 0 退出。`--config <path>` 和 `-w` 作为 Caddy 的写法被接受，
缩进也从两个空格改为每级一个制表符。

```bash
pingclair fmt [OPTIONS] [PATH]
```

| 参数 | 作用 |
| --- | --- |
| `-o`、`--overwrite` | 把格式化后的文本写回文件，而不是打印出来。 |
| `-d`、`--diff` | 打印直观的差异，而不是格式化后的文件。 |

```bash
pingclair fmt --diff              # what would change
pingclair fmt --overwrite         # apply it
```

## pingclair hash-password

为 `basic_auth` 指令生成密码哈希。省略 `--plaintext` 时从标准输入读取密码，这样密码不会留在 shell 历史中。

```bash
pingclair hash-password [OPTIONS]
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `-p`、`--plaintext <PLAINTEXT>` | 从标准输入读取 | 要哈希的密码。 |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` 或 `argon2id`。 |
| `--bcrypt-cost <COST>` | `14` | bcrypt 成本，取值 4 到 31。越高越慢，也越强。 |
| `--argon2id-time <TIME>` | `1` | argon2id 迭代次数。 |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id 内存成本，单位 KiB。 |
| `--argon2id-threads <THREADS>` | `4` | argon2id 并行度。 |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id 输出长度，单位字节。 |

```bash
pingclair hash-password --algorithm argon2id
```

把输出粘贴到指令中；[`basic_auth` 条目](/zh-CN/reference/directives/#basic_auth)展示了前后的语法。

## pingclair version

打印版本，候选版本打印的形式如 `v0.2.0-rc.3`。

```bash
pingclair version
```

## pingclair service

控制安装脚本写入的 systemd unit。它封装了 `systemctl`，两者都可以使用；这个子命令让 unit
的操作和其他命令放在一起。

```bash
pingclair service <start|stop|restart|reload|status>
```

| 子命令 | 作用 |
| --- | --- |
| `start` | 启动 unit。 |
| `stop` | 停止 unit。 |
| `restart` | 重启 unit，更改监听或进程级选项后需要这样做。 |
| `reload` | 通过信号请运行中的服务器重新读取配置文件。结果在 unit 的状态行和 journal 中，而不在本命令的退出码里。 |
| `status` | 打印 unit 的状态。 |

它只能在带 systemd 的 Linux 上使用；在其他平台上会拒绝运行。
[以服务方式运行](/zh-CN/start/service/)介绍了 unit 本身。

## 🧾 这些选项从哪里来

命令行定义在服务器源码的一个文件中，即 `pingclair/src/cli/mod.rs`，本页遵循它的顺序。
那里的命令参数一变，本页也随之更新。
