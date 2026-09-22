---
title: Command line
h1_emoji: '⌨️'
description: Every subcommand the binary exposes, with its flags, defaults, and prerequisites, checked against `pingclair --help`.
---

Pingclair ships as a single binary with a command line in the usual Unix shape:

```bash
pingclair <command> [<args…>]
```

Angle brackets mark something required, square brackets something optional, and
`…` a value that can be repeated. Every command answers `--help` with the same
text this page was written from, and `pingclair help <command>` prints it as
well. Running the binary with no command prints the list.

The installer also links the binary as `pc`, so every command below has a
two-letter spelling: `pc validate`, `pc service reload`, and so on. The two are
the same program; `pc` is a symlink, not a second binary.

## 🚩 Global flags

| Flag | What it does |
| --- | --- |
| `-v`, `--verbose` | Raise the log level to `debug` for this run. Accepted before or after the command. |
| `-h`, `--help` | Print the help for the command it is attached to. |
| `-V`, `--version` | Print the version. Top level only. |

## 🧭 Commands at a glance

| Command | What it does |
| --- | --- |
| `run` | Run the server in the foreground. |
| `reload` | Apply an edited configuration through the Admin API, and report what the server thought of it. |
| `start` | Start a detached copy of the server. |
| `stop` | Stop a running server through the Admin API. |
| `completion` | Print a shell completion script. |
| `environ` | Print the environment the server will see. |
| `list-modules` | List the modules compiled into this binary. |
| `build-info` | Print build metadata, including the toolchain. |
| `manpage` | Write man pages into a directory. |
| `storage-export` | Move the certificate store into a tarball. |
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
| `service` | Drive the installed systemd unit. |

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
| `-w`, `--watch` | Watch the configuration file — mtime, polled once a second — and send the process the reload signal after every change. Intended for local development, where a rejected edit is quickly visible. |

```bash
pingclair run --watch
```

For a server that survives the terminal, use the installed unit
([Run it as a service](/start/service/)) or [Quickstart](/start/quickstart/),
which walks through the same command as a service.

## pingclair reload

Applies an edited configuration to a running server through the Admin API.
Because the request is answered by the server, this command reports what the
server made of the file — unlike a signal, which systemd can only confirm was
delivered.

```bash
pingclair reload [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, then `./Caddyfile` | Configuration file to apply. |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API address. |

The Admin API has to be running: the global `admin` option enables it, and a
configuration without that option has no endpoint to reach. A reload that the
running server cannot apply — a changed listener topology is the common case —
leaves the previous configuration serving.

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

Starts a copy of the server that keeps running after the shell exits, without a
service manager in the picture.

```bash
pingclair start [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, then `./Caddyfile` | Configuration file to load. |

The process is detached from the terminal and its output is discarded, so
nothing is logged anywhere. On a host with systemd, the installed unit is the
better tool: it captures the log, restarts on failure, and knows when the
listeners are bound. See [Run it as a service](/start/service/).

## pingclair stop

Stops a running server through the Admin API — the same `POST /stop` the Admin
API exposes. Requires the `admin` option, like `reload`.

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

Prints the environment the server will run with, so a value such as
`PINGCLAIR_TLS_STORE` can be checked before a start rather than inferred from a
failure afterwards.

```bash
pingclair environ
```

## pingclair list-modules

Lists the modules and features compiled into this binary. `--json` prints the
same list as structured output, for scripts.

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

Writes the certificate store named by `PINGCLAIR_TLS_STORE` into a tar archive.
`-` as the output path writes the archive to standard output.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-export -o /tmp/store.tar
```

The archive contains private keys, so it is written mode `600` and belongs on
encrypted media rather than in a backup that ships to a bucket. The
[TLS guide](/guides/tls-tuning/) covers what it carries and when to move it.

## pingclair storage-import

Restores a store from an archive written by `storage-export`. `-` reads the
archive from standard input.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

Installs the internal CA root certificate into the system trust store, after
which browsers and command-line clients accept the certificates that authority
issues. It reads the CA from the store named by `PINGCLAIR_TLS_STORE`.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust
```

The [HTTPS](/start/https/) page covers when this is needed and how to check
that it worked.

## pingclair untrust

Removes that root certificate from the system trust store again. Certificates
already issued by it keep their files; clients stop trusting them.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair untrust
```

## pingclair respond

Serves a fixed response — status, headers, body — for development and for
testing clients against an origin that always answers the same way.

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

With no `--listen`, the port is chosen for you and printed, which keeps two
development servers from fighting over a fixed one.

## pingclair reverse-proxy

Starts a proxy from a listener to one or more upstreams without writing a
configuration file. This is the one-line version of
[the reverse proxy guide](/guides/reverse-proxy/), and it serves a
production-shaped configuration rather than a toy: the upstream is required,
and multiple `--to` values load-balance.

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | Address to listen on. |
| `--to <TO>` | required | Upstream address. Repeat for several. |
| `--header-up <HEADERS_UP>` | none | Request header to send upstream, as `Field: value`. Repeatable. |
| `--header-down <HEADERS_DOWN>` | none | Response header to send downstream, as `Field: value`. Repeatable. |
| `--insecure` | off | Skip TLS verification when the upstream's certificate does not match. |
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
starting anything. Exit status is non-zero when the configuration is refused,
which is what makes it usable in a pipeline or a deployment script.

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

Prints the JSON form that the configuration compiles to. `--pretty` indents it
for reading, and `--validate` runs the checks that need the filesystem —
certificate paths, for example — instead of only the syntax.

```bash
pingclair adapt [OPTIONS]
```

| Flag | Default | What it does |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, then `./Caddyfile` | Configuration file to read. |
| `-p`, `--pretty` | off | Indent the JSON. |
| `--validate` | off | Also validate what the adapted document refers to. |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Formats a Pingclairfile and prints the result. With no path, it reads
`./Pingclairfile`; `-` reads standard input.

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

Manages the systemd unit the installer wrote. It wraps `systemctl`, so the two
are interchangeable; this exists so that the commands for the unit are in the
same place as the rest of them.

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

Linux with systemd only. On any other platform the command refuses rather than
pretending, and [Run it as a service](/start/service/) is where the unit itself
is documented.

## 🧾 Where these options come from

The command line is defined in one file in the server source,
`pingclair/src/cli/mod.rs`, and the page above follows its order. The version on
each `--help` screen and the version this page was checked against are the same
one; when a command's flags change, this page changes with them.
