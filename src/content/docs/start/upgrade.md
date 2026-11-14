---
title: Upgrading and removing
h1_emoji: '🧹'
sidebar:
  order: 5
description: Install the v0.3 alpha preview without replacing the stable channel, validate an existing configuration, preserve the certificate store, and plan rollback.
---

Version **v0.3.0-alpha.1** is a preview of the 0.3 line. The latest stable
release remains **v0.2.3**, and the default installer and `latest` container
tag continue to follow stable releases.

Read the complete
[Before you upgrade list](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)
before replacing a binary. Use a staging deployment first, keep the current
binary and complete TLS store, and retain a configuration that the stable
binary can load.

## ⚠️ What changes in the preview

| Area | What to review |
| --- | --- |
| Layer 4 | A global `layer4` block adds raw TCP routing by TLS SNI, ALPN, and source address, with static or dynamic DNS upstreams. Existing HTTP configurations do not need a Layer 4 block. |
| Caddyfile validation | Site addresses and TLS placement follow the current Caddyfile rules more closely. A configuration that places plaintext on the HTTPS port, or combines a scheme and port inconsistently, is refused at load. |
| Error routes | `reverse_proxy` can now serve from `handle_errors`. Review an error route that previously relied on a static `respond`. |
| Variables and logs | `map`, `invoke`, `log_append`, and `log_name` add request-scoped values and access-log fields. Existing routes continue to use their previous configuration. |
| Route proxies | Each `reverse_proxy` in a `route` block reaches the upstream named by that block. A configuration that appeared to use several upstreams but always reached the first now behaves as written. |
| Formatting | `pingclair fmt` preserves comments and formats the source text. Review its output before overwriting a production file. |
| HTTP/3 | Malformed transport and HTTP/3 inputs receive protocol close messages instead of waiting for timeout. No configuration change is required. |
| Lifecycle | Stalled request-body writes and upgraded half-closes now end at their configured boundary. A complete upstream response that already arrived remains valid. |

The alpha adds Layer 4; existing HTTP directives are not removed. Always run the
new binary's `validate` against the deployment's actual configuration.

## 📦 Install the preview

The installer has no version-pinning flag and continues to select the latest
stable release. Download the exact preview assets from the GitHub release,
verify the published SHA-256 value, and replace the binary only after the
checksum succeeds.

[Install](/start/install/#-install-the-preview) contains the architecture-aware
download commands. On an existing installation, the final sequence is:

```bash
sudo pc service stop
sudo install -m 0755 pingclair /usr/local/bin/pingclair
sudo pc service start
```

For containers, pin the exact prerelease tag:

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.3.0-alpha.1
```

```bash
docker compose pull
docker compose up -d
docker compose logs pingclair
```

`latest` does not advance to an alpha, beta, or release candidate.

## 📦 Preserve the previous installation

Back up the configuration, current binary, and complete TLS store before
installing the preview. Preserve ownership and protect backups containing
private keys.

The installer preserves `/etc/Pingclair/Pingclairfile`, the certificate store
under `/var/lib/pingclair/.local/share/pingclair`, and the site files. A
configured `storage file_system` path takes precedence over the default store.

Keep the stable `v0.2.3` binary and its matching configuration. A preview
configuration may use directives that the stable binary cannot load.

## 🛡️ Check before switching

Run the preview binary's `validate` against the production file while the old
binary remains installed:

```bash
./pingclair validate /etc/Pingclair/Pingclairfile
```

The validating user must be able to read every certificate and key named by the
file. A successful validation opens no listeners and does not prove the
deployment's DNS, firewall, or Layer 4 backend routing.

In staging, test the HTTP protocols used by the deployment and every new Layer
4 listener. For Layer 4, confirm that the intended SNI or source address selects
the expected upstream and that the upstream performs the TLS handshake.

## ⏪ Roll back

Stop the preview service, restore the previous binary, configuration, and TLS
store with their original ownership, then validate with the restored binary
before starting it.

Do not overwrite a running certificate store with a partial backup. Keep the
preview's configuration separate from the stable configuration until the
rollback decision is complete.

## 🧹 Remove the installation

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

These commands preserve `/etc/Pingclair`, `/var/lib/pingclair`, and
`/var/log/pingclair`, including certificates and site files. Delete retained
data only when it is no longer needed for reinstall or rollback.

<span id="️-what-changes-in-020"></span>

## 🕰️ Upgrading from 0.1.x or 0.2

The [0.2.0 Before you upgrade section](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)
remains the reference for routing order, path normalization, listener binding,
client identity, compression, cache, Admin API, metrics, TLS, upstream, and
lifecycle changes introduced by the 0.2 line. Validate the existing file with
the preview binary and keep a stable rollback before applying those changes.

## 🧭 Next steps

- [Install](/start/install/): stable and preview installation paths.
- [Layer 4 guide](/guides/layer4/): TCP routing configuration and boundaries.
- [Project status](/project/status/): known limitations in the preview.
