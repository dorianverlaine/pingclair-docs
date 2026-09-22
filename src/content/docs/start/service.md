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
Environment="PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs"
ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -HUP $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=always
RestartSec=5s
LimitNOFILE=1048576
```

Read them in order:

- `Type=notify` and `NotifyAccess=main`: the server tells `systemd` when its
  listeners are bound, so `systemctl start` blocks until the proxy can answer
  rather than until the process exists.
- `User=pingclair` with `AmbientCapabilities=CAP_NET_BIND_SERVICE`: the server
  runs unprivileged and can still bind ports 80 and 443.
- `PINGCLAIR_TLS_STORE`: certificates live in `/var/lib/pingclair/certs`. The
  service account has no home directory, so leaving this to the binary's default
  would send the store to a `$HOME` that does not exist.
- `ExecStartPre` runs `validate` before every start. A configuration that does
  not compile never reaches the server.
- `ExecReload` sends `SIGHUP`, which the server drops, so `systemctl reload` —
  and `pc service reload`, which wraps it — reports success and changes nothing
  ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)). The
  signal that reloads is `SIGUSR1`.
- `Restart=always` with `RestartSec=5s`: a start that fails is retried every five
  seconds. See the failure modes below, because this is the one setting that
  surprises people.

⚠️ The `curl | bash` install writes a reduced copy of the unit. The repository's
`scripts/pingclair.service` adds hardening (`ProtectSystem=full`, `PrivateTmp`,
`NoNewPrivileges`, `LimitNPROC`) and a different restart policy
(`Restart=on-failure` with `RestartPreventExitStatus=1`). To use that stricter
unit:

```bash
git clone https://github.com/dorianverlaine/pingclair
sudo cp pingclair/scripts/pingclair.service /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo systemctl restart pingclair
```

## 🎛️ Driving the service

`pc service` wraps `systemctl` for this unit, so the two are interchangeable:

| Task | With `pc` | With `systemctl` |
| --- | --- | --- |
| Start | `sudo pc service start` | `sudo systemctl start pingclair` |
| Stop | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| Restart | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| Reload the configuration | — | `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` |
| Reload, as installed (does nothing) | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| State | `pc service status` | `systemctl status pingclair` |
| Follow the log | — | `journalctl -u pingclair -f` |

`pc service status` prints the unit's own view, including the readiness line the
server sent:

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
    Process: 1805 ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile (code=exited, status=0/SUCCESS)
   Main PID: 1808 (pingclair)
     Status: "Serving"
```

## 🔁 What a reload means

Two commands apply an edited configuration, and one that looks like a third does
nothing at all.

`SIGUSR1` is the reload signal. It needs no configuration of its own:

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pingclair reload` reaches the same code through the Admin API and reports what
the server thought of the file, which needs the `admin` option from the global
options block:

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`pc service reload` looks like the obvious command and is the one that does
nothing: the installed unit's `ExecReload` sends `SIGHUP`, and the server drops
that signal, so the command reports success while the old configuration keeps
serving. Measured on this unit: with `x-version: four` live and `five` written to
the file, `pc service reload` answered `✅ Service reloaded successfully` and the
header stayed `four`; the same edit applied through `SIGUSR1` or `pingclair
reload` took effect immediately
([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)).

Whatever path you use, a configuration that does not compile leaves the previous
one running, so the site keeps answering, and the server does not log the
refusal. Validate first:

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

Process-wide policy is the exception. Options that are established at startup,
such as `trusted_proxies`, only take effect after a restart:
`sudo pc service restart`. A configuration that adds or moves a listener also
needs a restart: reload applies policy, not a new listening socket.

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
INFO pingclair_proxy::server: ♻️ Configuration reloaded successfully
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

For a log of its own, with rotation, configure a `log` sink and write it under
`/var/log/pingclair`, which the installer creates and gives to the service user.

## ⚠️ When the service will not come up

- **`is-active` says `activating` and `NRestarts` keeps climbing.** That is the
  installed restart policy at work: `Restart=always` retries every five seconds,
  so a broken configuration looks like a unit that never settles rather than one
  that failed. Stop the loop before debugging:
  `sudo systemctl stop pingclair`, fix the file, then
  `sudo systemctl reset-failed pingclair`.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** `ExecStartPre` refused the configuration and the compiler's
  reason is in the journal, for example
  `Error: ❌ Configuration Error: Compile error: Unsupported feature: 'encode br': Brotli is not implemented for proxied responses; use 'encode zstd gzip'`.
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`.** The
  store belongs to the service account. Check
  `sudo ls -ld /var/lib/pingclair/certs`; it should be owned by `pingclair`.
- **`systemd-analyze verify` reports `Missing '=', ignoring line` for the
  installed unit.** The reduced copy written by the one-liner installer contains
  stray lines from a shell substitution, and `systemd` ignores them. Installing
  the repository's `scripts/pingclair.service` removes them.
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
