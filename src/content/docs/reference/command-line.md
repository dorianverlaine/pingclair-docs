---
title: Command line
h1_emoji: '⌨️'
description: Every pingclair subcommand with its flags, defaults, and prerequisites, checked against the binary's own --help output.
---

Pingclair is one binary. Every task, from running the server to checking a
configuration, is a subcommand of it:

```bash
pingclair <command> [<args…>]
```

Angle brackets mark a required value, square brackets an optional one, and `…`
a value that can be repeated. Every command answers `--help`, and
`pingclair help <command>` prints the same text. Running the binary with no
command prints the list of commands.

📌 This page describes **v0.2.0-rc.3**, the latest published release. Changes
that exist only on the server's `main` branch are marked **Next release**.

The installer also links the binary as `pc`, so every command below has a
two-letter spelling: `pc validate`, `pc service reload`, and so on. The two are
the same program: `pc` is a symbolic link, not a second binary.

## 🚩 Global flags

| Flag | What it does |
| --- | --- |
| `-v`, `--verbose` | Raise the log level to `debug` for this run. Accepted before or after the command. Unlike `caddy -v`, it does not print the version. |
| `-h`, `--help` | Print the help for the command it is attached to. |
| `-V`, `--version` | Print the version. Top level only. |

## 🧭 Commands at a glance

| Command | What it does |
| --- | --- |
| `run` | Run the server in the foreground. |
| `reload` | Apply an edited configuration through the Admin API and report whether the server accepted it. |
| `start` | Start a detached copy of the server. |
| `stop` | Stop a running server through the Admin API. |
| `completion` | Print a shell completion script. |
| `environ` | Print the environment the server will see. |
| `list-modules` | List the modules compiled into this binary. |
| `build-info` | Print build metadata, including the toolchain. |
| `manpage` | Write man pages into a directory. |
| `storage-export` | Write the certificate store into a tar archive. |
| `storage-import` | Restore a certificate store from that tarball. |
| `trust` | Install the internal CA root into the system trust store. |
| `untrust` | Remove it again. |
| `respond` | Serve a fixed response, for development. |
| `reverse-proxy` | Proxy to an upstream without a configuration file. |
| `file-server` | Serve a directory without a configuration file. |
| `validate` | Compile a configuration and report what is wrong with it. |
| `adapt` | Print the compiled JSON form of a Pingclairfile. |
| `fmt` | Format a Pingclairfile, or show what formatting would change. |
| `hash-password` | Produce a password hash for `basic_auth`. |
| `version` | Print the version. |
| `service` | Control the installed systemd unit. |

**Next release:** `storage export` and `storage import` are added as Caddy's
spellings of `storage-export` and `storage-import`. The hyphenated names keep
working.

## pingclair run

Runs the server in the foreground with one configuration document. Logs go to
standard output and standard error, and `Ctrl-C` shuts the server down.

```bash
pingclair run [OPTIONS] [CONFIG]
```

| Argument | Default | What it does |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, then `./Caddyfile` | Configuration file or directory to load. |

| Flag | What it does |
| --- | --- |
| `-r`, `--resume` | Load the configuration the Admin API last autosaved instead of the file, the way `caddy run --resume` does. Overrides `CONFIG` when both are present. |
| `-w`, `--watch` | Check the configuration file's modification time once a second, and reload after every change. Intended for local development. |

```bash
pingclair run --watch
```

With no `CONFIG` and neither default file present, `run` exits with status 1.
Caddy starts an empty server in that case; Pingclair refuses, so a `run` typed
in the wrong directory fails visibly.

For a server that outlives the terminal, use the installed unit
([Run it as a service](/start/service/)).

## pingclair reload

Sends a configuration file to a running server through the Admin API
(`POST /load`). The server answers the request itself, so the command reports
whether the file was applied. A signal cannot do that: systemd can only confirm
that it was delivered.

```bash
pingclair reload [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, then `./Caddyfile` | Configuration file to apply. |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API address. |

The running configuration must enable the Admin API with the global `admin`
option; without it there is nothing to reach. When the server cannot apply the
new file, most often because a listener was added or moved, the command fails
and the previous configuration keeps serving.

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

Starts the server as a background process that keeps running after the shell
exits, without a service manager.

```bash
pingclair start [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, then `./Caddyfile` | Configuration file to load. |

The process is detached from the terminal and its output is discarded, so its
log is not kept anywhere. On a host with systemd, the installed unit is the
better tool: it captures the log, restarts on failure, and knows when the
listeners are bound. See [Run it as a service](/start/service/).

## pingclair stop

Stops a running server with the Admin API's `POST /stop`. Like `reload`, it
needs the `admin` option in the running configuration.

```bash
pingclair stop [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API address. |

## pingclair completion

Prints a completion script for one shell. The supported names are exactly the
ones the argument accepts: `bash`, `zsh`, `fish`, `powershell`, `elvish`.

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

Prints the environment this process inherited, one `NAME=value` per line, so a
value such as `PINGCLAIR_TLS_STORE` can be checked before a start. Unlike
`caddy environ`, it does not print paths the server computed.

```bash
pingclair environ
```

## pingclair list-modules

Lists the modules compiled into this binary. `--json` prints the same list as
JSON, for scripts.

**Next release:** `--versions`, `--packages`, and `-s`/`--skip-standard` are
accepted, so scripts written for `caddy list-modules` run unchanged.

```bash
pingclair list-modules [--json]
```

## pingclair build-info

Prints build metadata: version, target, and the toolchain that produced the
binary. Useful when reporting a defect, because it names the exact build.

```bash
pingclair build-info
```

## pingclair manpage

Writes the man pages into a directory that must already exist. The flag is
required, so nothing is written into the current directory by accident.

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

Writes the certificate store into a tar archive. The store is the one named by
`PINGCLAIR_TLS_STORE`, or else the data directory of the user running the
command. The prefix in the example points a root shell at the service account's
store instead of root's own. `-o -` writes the archive to standard output.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

The archive contains private keys, so it is written mode `600` and belongs on
encrypted media rather than in a backup that ships to a bucket. The
[TLS guide](/guides/tls-tuning/) covers what it carries and when to move it.

## pingclair storage-import

Restores a store from an archive written by `storage-export`. `-i -` reads the
archive from standard input.

**Next release:** both commands take `-c`/`--config <file>`, and a global
`storage file_system <path>` option in that file names the store. An import
that would restore nothing is refused.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

Installs the root certificate of the internal authority (`tls internal`) into
the system trust store. Afterwards, clients that use that store accept the
certificates the authority issues. The root is read from the store named by
`PINGCLAIR_TLS_STORE`.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

The [HTTPS](/start/https/) page covers when this is needed and how to check
that it worked.

## pingclair untrust

Removes that root certificate from the system trust store. The issued
certificates stay on disk, but clients stop trusting them.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

Serves one fixed response (status, headers, and body) for every request. It is
meant for development, and for testing a client against an origin that always
answers the same way.

```bash
pingclair respond [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | Status code to return. |
| `-H`, `--header <HEADERS>` | none | Response header as `Field: value`. Repeatable. |
| `-b`, `--body <BODY>` | empty | Response body. |
| `-l`, `--listen <LISTEN>` | a random loopback port | Listener address. |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

With no `--listen`, a free loopback port is chosen and printed, so two
development servers never compete for one port.

## pingclair reverse-proxy

Proxies a listener to one or more upstreams without a configuration file.
`--to` is required; repeating it spreads requests over several upstreams. The
[reverse proxy guide](/guides/reverse-proxy/) covers the same ground with a
configuration file.

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | Address to listen on. |
| `--to <TO>` | required | Upstream address. Repeat for several. |
| `--header-up <HEADERS_UP>` | none | Request header to send upstream, as `Field: value`. Repeatable. |
| `--header-down <HEADERS_DOWN>` | none | Response header to send downstream, as `Field: value`. Repeatable. |
| `--insecure` | off | Do not verify the upstream's TLS certificate. |
| `--internal-certs` | off | Issue this listener's certificates from the internal CA instead of trying a public one. |
| `--disable-redirects` | off | Do not provision the HTTP-to-HTTPS redirect listener. |
| `-c`, `--change-host-header` | off | Rewrite the upstream `Host` header to the upstream address, as Caddy does. |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

Serves a directory over HTTP without a configuration file.

```bash
pingclair file-server [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | Address to listen on. |
| `--root <ROOT>` | `.` | Directory to serve. |
| `-b`, `--browse` | off | Show directory listings. |
| `-d`, `--domain <DOMAIN>` | none | Serve this domain over HTTPS; requires `--listen` to be a port. |
| `--access-log` | off | Write one access line per request. |
| `--no-compress` | off | Disable response compression. |
| `--file-limit <FILE_LIMIT>` | none | Maximum number of files shown in a directory listing. |
| `--templates` | off | Render `.html` files as templates, as Caddy does. |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

Compression, caching headers, and single-page-application fallbacks belong in a
configuration file; the [static site guide](/guides/static-site/) covers them.

## pingclair validate

Compiles a configuration and reports the first problem it finds, without
starting anything. The exit status is non-zero when the configuration is
refused, so the command works as a gate in a deployment script.

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| Argument | Default | What it does |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, then `./Caddyfile` | Configuration file or directory to check. |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

Prints the JSON document a Pingclairfile compiles to. This is Pingclair's own
schema, the one `validate`, `run`, and the Admin API's `/load` accept. Unlike
`caddy adapt`, the output is not Caddy's `{"apps": …}` shape, and Caddy cannot
load it.

`--pretty` indents the JSON. `--validate` also runs the checks that
`validate` runs, such as whether certificate files exist.

**Next release:** `adapt` always validates before printing, so exit status 0
means this build can load the result. `--validate` is still accepted and
changes nothing.

```bash
pingclair adapt [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, then `./Caddyfile` | Configuration file to read. |
| `-p`, `--pretty` | off | Indent the JSON. |
| `--validate` | off | Also run the checks `validate` runs. |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Formats a Pingclairfile and prints the result. With no path, it reads
`./Pingclairfile`; `-` reads standard input.

**Next release:** `fmt` exits with status 1 when the input was not already
formatted, so it can gate a commit the way `caddy fmt` does; `--overwrite`
still exits 0. `--config <path>` and `-w` are accepted as Caddy's spellings,
and the indent becomes one tab per level instead of two spaces.

```bash
pingclair fmt [OPTIONS] [PATH]
```

| Flag | What it does |
| --- | --- |
| `-o`, `--overwrite` | Write the formatted text back to the file instead of printing it. |
| `-d`, `--diff` | Print a visual diff rather than the formatted file. |

```bash
pingclair fmt --diff              # what would change
pingclair fmt --overwrite         # apply it
```

## pingclair hash-password

Produces a password hash for the `basic_auth` directive. The password is read
from standard input when `--plaintext` is omitted, which keeps it out of the
shell history.

```bash
pingclair hash-password [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | read from standard input | Password to hash. |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` or `argon2id`. |
| `--bcrypt-cost <COST>` | `14` | bcrypt cost, 4 to 31. Higher is slower and stronger. |
| `--argon2id-time <TIME>` | `1` | argon2id iterations. |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id memory cost, in KiB. |
| `--argon2id-threads <THREADS>` | `4` | argon2id parallelism. |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id output length, in bytes. |

```bash
pingclair hash-password --algorithm argon2id
```

Paste the output into the directive; the
[`basic_auth` entry](/reference/directives/#basic_auth) shows the surrounding
syntax.

## pingclair version

Prints the version, as `v0.2.0-rc.3` does for a release candidate.

```bash
pingclair version
```

## pingclair service

Controls the systemd unit the installer wrote. It wraps `systemctl`, so either
can be used; this subcommand keeps the unit's commands next to the others.

```bash
pingclair service <start|stop|restart|reload|status>
```

| Subcommand | What it does |
| --- | --- |
| `start` | Start the unit. |
| `stop` | Stop the unit. |
| `restart` | Restart the unit, which is what a changed listener or a process-wide option needs. |
| `reload` | Ask the running server to read its configuration file again, by signal. The result is on the unit's status line and in the journal, not in this command's exit code. |
| `status` | Print the unit's state. |

It works only on Linux with systemd; on any other platform it refuses to run.
[Run it as a service](/start/service/) documents the unit itself.

## 🧾 Where these options come from

The command line is defined in one file of the server source,
`pingclair/src/cli/mod.rs`, and this page follows its order. When a command's
flags change there, this page changes with them.
