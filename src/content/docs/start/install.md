---
title: Install
description: Install Pingclair from a release binary, with Docker, or by building from source.
---

Pingclair targets Linux. Release binaries are published for `x86_64` and
`aarch64`. macOS builds from source are supported for development; macOS is not
a shipping platform.

## 📌 Release status

The default installation target is **v0.2.0-rc.3**, a release candidate. The
install script prints the tag it is installing and verifies the published
SHA-256 checksum before unpacking.

The `v0.1.x` line is unmaintained: it receives no fixes, no backports, and no
security advisories. One reason to move is that `v0.1.x` parsed the Admin API
`api_key` field and never read it, so the field protected nothing.

## 📦 Install from a release binary

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

The script downloads the release binary for the current architecture, verifies
its checksum, installs `pingclair` together with the `pc` alias, creates an
unprivileged `pingclair` user, grants that user the capabilities needed to bind
low ports, and installs a `systemd` unit.

To build and install the `main` branch instead of the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main` compiles the server locally. It requires Rust 1.98 or newer and the C
toolchain that BoringSSL and jemalloc need: `cmake`, `clang`, `libclang-dev`,
`g++`, and `git`.

Verify either installation:

```bash
pingclair version
pc version
```

## 🐳 Docker

The image already runs config-file mode: its entrypoint is `pingclair` and its
default command is `run /etc/pingclair/Pingclairfile`. A Compose service
therefore only has to mount the configuration and the data store.

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv
      - pingclair_tls:/var/lib/pingclair/certs

volumes:
  pingclair_tls:
```

Place the `Pingclairfile` in `./conf/` and static files under `./site/`, which
the configuration reaches with an absolute container path such as `root /srv`.
HTTPS, the port 80 redirect, and HTTP/3 behave the same as in a host
deployment.

Two points are easy to get wrong:

- **🔒 The TLS volume is state, not cache.** It holds issued certificates, ACME
  account keys, and the internal certificate authority. Removing it means
  reissuing certificates, and trusting clients have to trust the new internal
  root.
- **⚠️ Do not add `command:`.** The image default is already
  `run /etc/pingclair/Pingclairfile`; overriding it replaces that command.

For production, pin a released tag instead of `latest`. Published tags are
listed on the
[package page](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair).

## 🛠️ Build from source

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

Requirements: Rust 1.98.1 (the version CI pins), `cmake`, `clang`,
`libclang-dev`, `g++`, and `git`. BoringSSL is compiled from source as part of
the build, so the first build takes several minutes.

## 🧭 Next steps

- [Quickstart](/start/quickstart/): a first configuration, validated and running.
- [Configuration model](/concepts/configuration/): how validation decides what runs.
