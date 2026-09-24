---
title: Install
h1_emoji: '📦'
sidebar:
  order: 1
description: Put Pingclair on a Linux host from a release binary, with Docker, or from source, and verify that the service answers.
---

Pingclair ships as a single Linux binary. This page installs it, shows what the
installer left behind, and verifies that the server answers. The current release
is **v0.2.0-rc.3**, a release candidate, and every page on this site describes
that release.

## 🧾 What you need

- A Linux host on `x86_64` or `aarch64`; release binaries exist for both.
- `sudo` or root: the installer writes to `/usr/local/bin`, `/etc/Pingclair`,
  `/var/lib/pingclair`, and `/etc/systemd/system`.
- `systemd` for the service path. On a host without it, use Docker or run the
  server in the foreground; both are covered below.
- Ports 80 and 443 reachable from the internet if you want public certificates
  ([HTTPS](/start/https/)). On a cloud instance, that usually means opening them
  in the provider's firewall as well.

macOS builds from source and is supported for development. macOS is not a
shipping platform.

## 📦 Install from a release binary

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

The script reads the release channel at `releases.pingclair.com`, prints the tag
it is about to install, and checks the archive against the SHA-256 that channel
publishes for it — an archive that does not match is refused, not extracted. If
that host cannot be reached it falls back to the GitHub releases API and the
checksum file published beside the archive, so the install does not depend on
one provider. It then creates the service user, grants that user the capability
to bind low ports, writes the default configuration, installs the unit, and
starts the service. A complete run ends like this:

```text
Detected architecture: x86_64
Installing v0.2.0-rc.3 — a release candidate, not a final release.
Downloading https://releases.pingclair.com/pingclair/releases/0.2.0-rc.3/pingclair-linux-x86_64.tar.gz (from releases.pingclair.com)...
✅ sha256 matches the release channel document
Creating system user 'pingclair'...
Setting capabilities...
Configuring directories and assets...
Fetching default landing page...
Creating default Pingclairfile...
Installing Systemd service...
Creating 'pc' symlink...
✅ Installation Complete!
Use pc service status to check the service.
Config: /etc/Pingclair/Pingclairfile
```

To run an unreleased fix, build `main` on the host instead:

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main` clones and compiles the server on the host. It needs Rust 1.98 or newer
and the C toolchain BoringSSL and jemalloc require: `cmake`, `clang`,
`libclang-dev`, `g++`, and `git`. The script installs those packages itself on
both `apt` and `dnf` systems. The first build takes several minutes because
BoringSSL is compiled from source.

## 🗂️ What the installer left behind

| Path | What it holds |
| --- | --- |
| `/usr/local/bin/pingclair` | The server binary. |
| `/usr/local/bin/pc` | A symlink to the same binary, for the short form. |
| `/etc/Pingclair/Pingclairfile` | The configuration the service runs. |
| `/etc/Pingclair/Pingclairfile.example` | A commented example, never overwritten by an upgrade. |
| `/var/lib/pingclair/.local/share/pingclair` | The certificate store: the service user's data directory, which is where the binary looks by default. |
| `/var/lib/pingclair/html` | The placeholder site served on port 80. |
| `/var/log/pingclair` | Where a `log` sink writes once you configure one. |
| `/etc/systemd/system/pingclair.service` | The unit, enabled and running. |

The service is already serving when the script finishes. The configuration it
runs is the placeholder, and it is small enough to read in one screen:

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

The service user and the certificate store are created only if they are missing,
and an existing `/etc/Pingclair/Pingclairfile` is never replaced. That is what
makes re-running the installer an upgrade rather than a reset
([Upgrading and removing](/start/upgrade/)).

## ✅ Verify the installation

Ask the binary for its version:

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc` is the same binary, so `pc version` prints the same string. Then ask
`systemd` what it thinks:

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` comes from the server itself rather than from `systemd`
watching a process that is merely alive: the unit is of type `notify`, and the
server reports ready only after every listener is bound.

Finally, ask the server:

```bash
curl -i http://localhost/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 18747
Last-Modified: Tue, 22 Sep 2026 03:21:54 GMT
ETag: "493b-6ab1f452"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

A `200` with `ETag` and `Last-Modified` means the file server answered, and the
body is the placeholder page in `/var/lib/pingclair/html`.

## 🐳 Docker

The published image runs config-file mode: its entrypoint is `pingclair` and its
default command is `run /etc/pingclair/Pingclairfile`. The image declares
`/etc/pingclair` and `/var/lib/pingclair` as volumes, and exposes ports 80 and 443.

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv:ro
      - pingclair_tls:/var/lib/pingclair

volumes:
  pingclair_tls:
```

```bash
mkdir -p conf site
printf ':80 {\n    file_server /srv\n}\n' > conf/Pingclairfile
echo '<h1>hello from the container</h1>' > site/index.html
docker compose up -d
curl -i http://localhost/
```

Three points require attention:

- **Do not add `command:`.** The image default is already
  `run /etc/pingclair/Pingclairfile`, and overriding it replaces that command.
- **Mount all of `/var/lib/pingclair`, not only the certificate directory.**
  The store keeps state beside the certificates, and a container recreated
  with only part of it mounted loses that state.
- **Pin a released tag.** `latest` follows the newest release; production should
  name the version, as the example does. Published tags are listed on the
  [package page](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair).

On a host where your user is not in the `docker` group, prefix the commands with
`sudo`, or join the group once with `sudo usermod -aG docker "$USER"` and start a
new login session. On Ubuntu, the `docker compose` plugin comes from the
`docker-compose-v2` package.

## 🛠️ Build from source

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

Requirements: Rust 1.98.1 (the version CI pins), `cmake`, `clang`,
`libclang-dev`, `g++`, and `git`. BoringSSL is compiled from source as part of
the build, so the first build takes several minutes.

## ⚠️ When the install fails

- **`This script must be run as root`.** The script writes outside your home
  directory and installs a unit. Re-run it with `sudo`.
- **`setcap: command not found` on Fedora.** That is the `libcap` package. The
  installer adds it, but a hand-built host may lack it, and without the
  capability the service cannot bind ports 80 and 443.
- **`Job for pingclair.service failed` right after the install.** Read
  `journalctl -u pingclair -n 20`. Common causes are a configuration that does
  not validate, or something already listening on port 80.
- **The service is running but nothing answers from outside.** The listeners are
  bound and the packets never arrive. Check the provider's firewall or security
  group first, then the host's own rules.
- **The host has no `systemd`.** The binary is installed and usable, but the
  installer's service step cannot run. Use Docker, or `pingclair run`.

## 🧹 Removing it again

[Upgrading and removing](/start/upgrade/) walks through the teardown and names
the directories that hold data worth keeping.

## 🧭 Next steps

- [Quickstart](/start/quickstart/): replace the placeholder with your own
  configuration and serve a real site.
- [HTTPS](/start/https/): certificates for a public name.
- [Run it as a service](/start/service/): what the unit does and how to reload
  it safely.
