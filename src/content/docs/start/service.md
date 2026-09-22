---
title: Run it as a service
h1_emoji: '🔁'
sidebar:
  order: 4
description: What the installed systemd unit does, how to start, stop, and reload it, where the logs go, and what a failing configuration looks like from the outside.
---

The installer leaves a `systemd` unit enabled and running. This page reads that
unit line by line, shows how to drive it, and describes what the two failure
shapes look like from the outside: a server that will not start and a
configuration the running server refuses.

## 🧾 What the unit does

```bash
systemctl cat pingclair
```

The keys that matter are these:

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

Read them in order:

- `Type=notify` and `NotifyAccess=main`: the server tells `systemd` when its
  listeners are bound, so `systemctl start` blocks until the proxy can answer
  rather than until the process exists.
- `User=pingclair` with `AmbientCapabilities=CAP_NET_BIND_SERVICE`: the server
  runs unprivileged and can still bind ports 80 and 443.
- There is deliberately no `PINGCLAIR_TLS_STORE` here. The service account's home
  is `/var/lib/pingclair`, so certificates live at
  `/var/lib/pingclair/.local/share/pingclair`: the binary's own default, the
  directory the installer creates and migrates into, and the path `pingclair
  environ` prints. Naming a store here would be a second answer to a question
  that already has one.
- There is deliberately no `ExecStartPre` running `validate`. It looks like the
  safe place for that check, and it is the trap: `systemd` applies
  `RestartPreventExitStatus=` to the main process, not to a failing pre-command,
  so a configuration the compiler refuses was retried every five seconds
  instead of leaving the unit failed. The server compiles the file itself before
  it binds anything and exits 1 when it refuses it, which is the exit code the
  restart policy above was written for — `pingclair run` exists to be that
  process.
- `ExecReload` sends `SIGUSR1`, which is the signal the server treats as "read
  the file again". `SIGHUP` is deliberately ignored, and a unit that sent it
  reported success while the old configuration kept serving
  ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)). Because
  `systemd` can only observe that `kill` exited, the server publishes what it
  made of the file on this unit's status line — `Serving (reloaded 1
  listener(s) in 323.341µs)`, or `Reload rejected: …` — which `systemctl status`
  shows. The [reload section](#-what-a-reload-means) below is the long version.
- `Restart=on-failure` with `RestartPreventExitStatus=1` and `RestartSec=5s`:
  exit code 1 means the configuration or the certificate store could not be
  used at all, so the unit is left `failed` for an operator to look at rather
  than retried every five seconds. Any other failure is restarted.
- `ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`, `LimitNPROC`, and
  `LimitNOFILE`: the server gets the filesystem view and the process limits it
  needs, and nothing beyond them.

Both install paths write this same file. The one-liner embeds a byte-for-byte
copy of `scripts/pingclair.service` — `just repo-lint` fails when the two drift —
so a fresh `curl | bash` install and a checkout install produce the same unit,
and `systemd-analyze verify /etc/systemd/system/pingclair.service` says
nothing about this unit on either path.

## 🎛️ Driving the service

`pc service` wraps `systemctl` for this unit, so the two are interchangeable:

| Task | With `pc` | With `systemctl` |
| --- | --- | --- |
| Start | `sudo pc service start` | `sudo systemctl start pingclair` |
| Stop | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| Reload the configuration | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| Restart, after a listener or a process-wide change | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| State | `pc service status` | `systemctl status pingclair` |
| Follow the log | — | `journalctl -u pingclair -f` |

`pc service status` prints the unit's own view, including the readiness line the
server sent:

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 05:57:21 UTC; 18s ago
       Docs: https://github.com/dorianverlaine/pingclair
   Main PID: 27630 (pingclair)
     Status: "Serving"
```

## 🔁 What a reload means

An edited `/etc/Pingclair/Pingclairfile` reaches the running server through one
signal, and two commands send it.

`SIGUSR1` is the reload signal, and it needs no configuration of its own:

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload` — or `sudo systemctl reload pingclair`, which is the same
call — sends that signal for you. The unit's `ExecReload` is
`/bin/kill -USR1 $MAINPID`, so the obvious command is now the working one; a
unit that sent `SIGHUP` instead reported success and applied nothing, which is
what [issue #66](https://github.com/dorianverlaine/pingclair/issues/66) recorded.

`pingclair reload` reaches the same code through the Admin API and reports what
the server thought of the file, which needs the `admin` option from the global
options block:

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` can report one thing only: that `kill` delivered the signal.
The server reads the file afterwards, so its verdict goes to the unit's status
line and to the journal instead. `pc service reload` says so rather than
claiming the configuration was applied:

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

When the running server cannot apply what the file asks for, the old
configuration keeps serving and the status line says which change was refused.
Moving the site from `:80` to `:8080` is the common case, because listener
topology is rebuilt with the sockets at startup:

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

Whatever path you use, a configuration that does not compile leaves the previous
one running, so the site keeps answering. Validate first:

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

Process-wide policy is the exception. Options that are established at startup,
such as `trusted_proxies`, only take effect after a restart:
`sudo pc service restart`. A configuration that adds or moves a listener is
refused the same way — the status line names the addresses that were added and
removed — because reload applies policy, not a new listening socket.

## 📜 Logs

The unit sets `RUST_LOG=info` and sends everything to the journal:

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

Startup, reloads, certificate work, and one access line per request appear
there:

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

A reload the server refuses is logged the same way, with the reason and a note
that nothing changed:

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

For a log of its own, with rotation, configure a `log` sink and write it under
`/var/log/pingclair`, which the installer creates and gives to the service user.

## ⚠️ When the service will not come up

- **`is-active` says `activating` and `NRestarts` keeps climbing.** That is the
  retired behaviour of an older unit, and it had two causes. It carried
  `Restart=always` with no `RestartPreventExitStatus`, and it ran `validate` as
  an `ExecStartPre` command, which `RestartPreventExitStatus` does not cover —
  so a configuration the compiler refuses was retried every five seconds and
  looked like a unit that never settles rather than one that failed. The
  installed unit carries `Restart=on-failure` + `RestartPreventExitStatus=1` and
  no pre-command, and a refused start leaves `is-active` at `failed` with
  `NRestarts` at zero. On an older install, stop the loop before debugging:
  `sudo systemctl stop pingclair`, fix the file, then
  `sudo systemctl reset-failed pingclair`.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** The server refused the configuration before it bound anything,
  and the compiler's reason is in the journal, for example
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`.** The
  store belongs to the service account. Check
  `sudo ls -ld /var/lib/pingclair/.local/share/pingclair`; it should be owned by `pingclair`.
- **`systemd-analyze verify` reports `Missing '=', ignoring line` for the
  installed unit.** An older one-liner install wrote a unit whose comments had
  been expanded by the shell — 25 lines of `--help` output, which `systemd`
  ignores. Reinstalling from the current installer writes the unit verbatim and
  the report goes away.
- **Nothing answers although the unit is running.** The listeners are bound and
  the requests do not arrive. Check the provider's firewall and then the host's,
  as on the [install page](/start/install/).

## 🧭 Next steps

- [Upgrading and removing](/start/upgrade/): what a re-run preserves, and how to
  take it all out again.
- [HTTPS](/start/https/): certificates, including where the store lives and why
  `pingclair trust` needs `PINGCLAIR_TLS_STORE`.
- [`log`](/reference/directives/#log): the access-log sink this page reads from
  the journal.
