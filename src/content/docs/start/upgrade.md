---
title: Upgrading and removing
h1_emoji: '🧹'
sidebar:
  order: 5
description: Re-run the installer to upgrade, pin a container tag, roll back to an older release, and remove Pingclair while preserving its configuration and data.
---

An upgrade replaces two things — the binary and the service unit — and preserves
the configuration and certificates. This page explains that behavior, the
equivalent container procedure, how to roll back to an earlier release, and how
to remove the installation.

## 🧾 Files preserved during an upgrade

| Path | An upgrade |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | Kept. The installer only writes it when it is missing. |
| `/etc/Pingclair/Pingclairfile.example` | Replaced with the current example. |
| `/var/lib/pingclair/.local/share/pingclair` | Kept. Issued certificates and ACME state stay in place. |
| `/var/lib/pingclair/html` | Kept. |
| `/usr/local/bin/pingclair` and `pc` | Replaced with the new release. |
| `/etc/systemd/system/pingclair.service` | Rewritten, then the service is restarted. |

## ⬆️ Upgrade with the installer

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

The script finds the newest release on the release channel, prints its tag,
verifies the archive's SHA-256, replaces the binary and the unit, and restarts
the service. When the channel host cannot be reached, it asks the GitHub
releases API instead; the run below took that path, which is why it prints
`Fetching latest release`.
A configuration file that already exists is not touched, which is what makes
this an upgrade rather than a reset:

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

Confirm the new version and that the old configuration still serves:

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

The installer always installs the newest release. There is no flag for
installing a specific version; that is what the rollback below is for.

## ⚠️ Read the upgrade notes before 0.2.0

The next release changes behavior that an unchanged configuration can notice:
which route answers a request, whether a site without `encode` compresses, the
default request-body limit, what `remote_ip` matches, and where the internal
authority keeps its root. [Project status](/project/status/#-what-changes-in-the-next-release)
summarizes them, and the
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
gives each one an upgrade note. Validate your configuration with the new binary
before you restart the service on it.

## 🐳 Upgrade a container

Nothing is installed on the host, so an upgrade is a tag change and a pull.
Pin the new release in the compose file:

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
```

```bash
docker compose pull
docker compose up -d
docker logs pingclair 2>&1 | head -3
```

```text
🚀 Starting Pingclair with config: /etc/pingclair/Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: /etc/pingclair/Pingclairfile
```

The configuration and the certificate store live in the volumes, so the new
container finds them where the old one left them. Account for two constraints:

- **A container that maps port 80 cannot start while the systemd service is
  running.** Stop one of them: `sudo pc service stop`, or change the published
  port on the container side.
- **`latest` follows the newest release.** Pin a version in production, so an
  upgrade is a decision rather than a side effect of a pull.

## ⏪ Roll back to an older release

To replace a problematic release with an earlier version, fetch the previous
release from the release host, verify it against its published digest, and
replace the installed binary:

```bash
mkdir -p /tmp/rollback && cd /tmp/rollback
version=0.2.0-rc.2
base="https://releases.pingclair.com/pingclair/releases/$version"
curl -fsSL "$base/release.json" -o release.json
tarball=pingclair-linux-x86_64.tar.gz
expected="$(jq -r ".assets[] | select(.name == \"$tarball\") | .digest" release.json | sed 's/^sha256://')"
curl -fsSLO "$base/$tarball"
printf '%s  %s\n' "$expected" "$tarball" | sha256sum -c -
mkdir -p extract && tar -xzf "$tarball" -C extract
```

```text
pingclair-linux-x86_64.tar.gz: OK
```

```bash
sudo systemctl stop pingclair
sudo install -m 0755 extract/pingclair /usr/local/bin/pingclair
sudo systemctl start pingclair
pingclair version
```

```text
v0.2.0-rc.2
```

Then validate the configuration against the version you rolled back to, because
a directive the older release does not implement is refused by name rather than
ignored:

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## 🧹 Remove it

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

After that, `systemctl status pingclair` answers `Unit pingclair.service could
not be found`, the command is gone, and nothing listens on port 80. The removal
procedure intentionally preserves the following data:

```text
/etc/Pingclair/Pingclairfile      the configuration, still valid
/var/lib/pingclair/.local/share/pingclair          issued certificates and ACME state
/var/lib/pingclair/html           the placeholder site
/var/log/pingclair                a log sink's directory
```

Keep `/var/lib/pingclair/.local/share/pingclair` if you plan to reinstall: the certificates and
the internal root survive, and clients that trust that root stay working. Delete
everything, including the service account, when the host is finished with
Pingclair:

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ When it goes wrong

- **The installer installed a version you did not expect.** It always takes the
  newest release tag. Check with `pingclair version` and use the rollback above
  if you needed a specific one.
- **The service will not start after an upgrade.** Read
  `sudo pingclair validate /etc/Pingclair/Pingclairfile`. A directive that the
  new release refuses fails closed with its name and the alternative, so the
  journal names the line to change.
- **A container exits immediately.** `docker logs <container>` shows why. The
  common causes are a missing `/etc/pingclair/Pingclairfile` in the mounted
  configuration directory, or a port already in use on the host.
- **Clients reject the certificate after a rebuild of the store.** If the
  internal authority was regenerated, the old root no longer signs anything.
  Install the new one with
  `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust`.

## 🧭 Next steps

- [Install](/start/install/): the layout this page keeps or removes.
- [Run it as a service](/start/service/): the unit that an upgrade rewrites.
- [Project status](/project/status/): what the current release supports and what
  it refuses.
