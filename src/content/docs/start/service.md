---
title: Run it as a service
h1_emoji: '🔁'
sidebar:
  order: 4
description: The systemd unit settings, service commands, reload behavior, log locations, and troubleshooting procedures.
---

The installer creates and enables a `systemd` unit. This page explains its
settings, service commands, and procedures for investigating startup failures
and rejected configuration reloads.

## 🧾 What the unit does

```bash
systemctl cat pingclair
```

The relevant unit settings are:

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

These settings control readiness, permissions, reloads, and restarts:

- `Type=notify` and `NotifyAccess=main`: the server notifies `systemd` when its
  listeners are bound, so `systemctl start` waits for listener readiness.
- `User=pingclair` with `AmbientCapabilities=CAP_NET_BIND_SERVICE`: the server
  runs unprivileged and can still bind ports 80 and 443.
- The unit does not set `PINGCLAIR_TLS_STORE`. The service account's home
  is `/var/lib/pingclair`, so certificates resolve to
  `/var/lib/pingclair/.local/share/pingclair` — the binary's default, created by
  the installer and printed by `pingclair environ`. Setting the variable here
  would duplicate what the home directory already determines.
- The unit does not run `validate` through `ExecStartPre`. `systemd` applies
  `RestartPreventExitStatus=` to the main process, not to a pre-command, so a
  failing pre-command would be retried every five seconds instead of leaving the
  unit failed. The server compiles the file itself before binding listeners and
  exits 1 on a refused configuration — the exit code the restart policy
  prevents.
- `ExecReload` sends `SIGUSR1` to reload the configuration. `SIGHUP` is ignored; a unit that sent it
  reported success
  while the old configuration kept serving
  ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)). Because
  `systemd` can only observe that `kill` exited, the server publishes its
  reload result on the unit's status line — `Serving (reloaded 1 listener(s) in
  323.341µs)`, or `Reload rejected: …` — visible in `systemctl status`. The
  [reload section](#-what-a-reload-means) below covers this in detail.
- `Restart=on-failure` with `RestartPreventExitStatus=1` and `RestartSec=5s`:
  exit code 1 means the configuration or the certificate store could not be
  loaded, so the unit remains `failed` for investigation without repeated
  restart attempts. Any other failure is restarted.
- `ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`, `LimitNPROC`, and
  `LimitNOFILE`: these settings restrict filesystem access,
  privilege escalation, and process resources.

Both installation methods write the same unit. The installer embeds an exact
copy of `scripts/pingclair.service`, and `just repo-lint` fails when the two
drift. A fresh `curl | bash` install and a checkout install produce the same
unit, and `systemd-analyze verify` reports no warnings for it on either path.

<span id="️-driving-the-service"></span>

## 🎛️ Service commands

`pc service` wraps `systemctl` for this unit, so the two are interchangeable:

| Task | With `pc` | With `systemctl` |
| --- | --- | --- |
| Start | `sudo pc service start` | `sudo systemctl start pingclair` |
| Stop | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| Reload the configuration | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| Restart, after a listener or a process-wide change | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| State | `pc service status` | `systemctl status pingclair` |
| Follow the log | — | `journalctl -u pingclair -f` |

`pc service status` displays the unit state and the server's readiness status:

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 05:57:21 UTC; 18s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
```

## 🔁 What a reload means

An edited `/etc/Pingclair/Pingclairfile` reaches the running server through one
signal, and two commands send it.

`SIGUSR1` is the reload signal and requires no configuration:

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload` — or `sudo systemctl reload pingclair`, which is the same
call — sends that signal for you. The unit's `ExecReload` is
`/bin/kill -USR1 $MAINPID`, so this command performs the intended reload. A unit
that sent `SIGHUP` instead reported success and applied nothing, which is what
[issue #66](https://github.com/dorianverlaine/pingclair/issues/66) recorded.

`pingclair reload` reaches the same code through the Admin API and reports
whether the server accepted the file. This path requires the `admin` option from
the global options block:

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` can report one thing only: that `kill` delivered the signal.
The server reads the file afterwards and reports the reload result on the
unit's status line and in the journal. `pc service reload` reports signal
delivery and provides commands for checking the reload result:

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

If the server cannot apply the new configuration, the previous configuration
remains active and the status line identifies the rejected change.
Moving the site from `:80` to `:8080` is the common case, because listener
topology is rebuilt with the sockets at startup:

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

A configuration that fails compilation leaves the previous configuration
active. Validate the file before reloading:

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

Changes to startup-fixed global policies, such as `trusted_proxies`, are refused
by reload and take effect after a restart. Process-log settings can reload. Use
`sudo pc service restart`. A configuration that adds or moves a listener is
refused the same way — the status line names the addresses that were added and
removed — because reload applies policy, not a new listening socket.

## 🛑 What a stop means

`systemctl stop` sends `SIGTERM`. The server makes `/ready` return `503`, stops accepting new requests, and lets active requests finish within `grace_period` (30 seconds by default). Remaining QUIC connections close when the drain ends. A restart has a connection gap between processes; prefer reload for site policy changes.

## 📜 Logs

The unit sets `RUST_LOG=info` and sends everything to the journal:

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

Startup, reloads, certificate operations, and one access line per request appear
there:

```text
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

<span id="️-when-the-service-will-not-come-up"></span>

## ⚠️ Service startup failures

- **`is-active` reports `activating` and `NRestarts` continues to increase.** The unit
  was written by an older installer, which had two faults. It carried
  `Restart=always` with no `RestartPreventExitStatus`, and it ran `validate` as
  an `ExecStartPre` command, which `RestartPreventExitStatus` does not cover —
  so a configuration the compiler refuses was retried every five seconds and
  left the unit repeatedly attempting startup. The
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
  installed unit.** An older installer wrote a unit whose comments had
  been expanded by the shell — 25 lines of `--help` output, which `systemd`
  ignores. Reinstalling from the current installer writes the unit verbatim and
  resolves the invalid unit contents.
- **The unit is running but external requests fail.** Check the provider's
  firewall and then the host's,
  as on the [install page](/start/install/).

## 🧭 Next steps

- [Upgrading and removing](/start/upgrade/): files retained during an upgrade
  or removal.
- [HTTPS](/start/https/): certificates, including where the store lives and why
  `pingclair trust` needs `PINGCLAIR_TLS_STORE`.
- [`log`](/reference/directives/#log): the access-log sink this page reads from
  the journal.
