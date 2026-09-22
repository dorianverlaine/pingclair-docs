---
name: install-pingclair
description: Install, upgrade, or verify Pingclair, the reverse proxy and static file server for Linux.
---

# Install Pingclair

Use this skill when a host has no Pingclair installation, when an installation
has to be upgraded, or when a Pingclair release has to be verified before it
serves traffic.

## Prerequisites

- A Linux host. Release binaries exist for `x86_64` and `aarch64`.
- `sudo` for the install script, or Docker with a compose file.

## Steps

1. Install the current release binary. The script prints the tag it installs and
   verifies the published SHA-256 checksum before unpacking:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
   ```

   It installs `pingclair` plus the `pc` alias, creates an unprivileged
   `pingclair` user, grants the capabilities needed to bind low ports, and
   installs a `systemd` unit.

2. Verify the installation:

   ```bash
   pingclair version
   pc version
   ```

3. To build and install `main` instead of a release, add `--main`. This compiles
   locally and needs Rust 1.98.1 with `cmake`, `clang`, `libclang-dev`, `g++`,
   and `git`; BoringSSL is compiled as part of the build.

   ```bash
   curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
   ```

## Container installation

The published image runs config-file mode: its entrypoint is `pingclair` and its
default command is `run /etc/pingclair/Pingclairfile`.

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

## Failure modes

- The TLS volume is state, not cache: it holds issued certificates, ACME account
  keys, and the internal certificate authority. Deleting it forces reissuance.
- Do not add `command:` to the service. The image default is already
  `run /etc/pingclair/Pingclairfile`, and overriding it replaces that command.
- Pin a released tag in production rather than `latest`.
- macOS builds from source are supported for development only; macOS is not a
  shipping platform.

## Source

<https://pingclair.com/start/install.md>
