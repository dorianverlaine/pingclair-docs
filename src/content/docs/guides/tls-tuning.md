---
title: 'TLS: what you can tune'
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Which TLS and protocol settings Pingclair honors, which it refuses by name, and how to require client certificates or move a certificate store between hosts.
---

Pingclair intentionally exposes few TLS settings: a name gets a certificate
automatically, and the settings on this page decide how. Any other TLS setting
Caddy accepts is refused by name rather than ignored, so a configuration never
quietly does less than it says. Each result below was measured on a real host.

📌 This page describes **v0.2.0-rc.3**, the latest published release. Changes
that exist only on the server's `main` branch are marked **Next release**.

## 🧾 Before you start

- Pingclair installed and running ([Install](/start/install/)).
- For the certificate-authority parts, a name that resolves to the host, or the
  internal authority for a lab machine ([HTTPS](/start/https/)).

## 🌐 Which protocols are served

The protocol set lives in the global `servers` block:

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

Measured with `sudo ss -lun | grep ':443 '`:

| Configuration | UDP 443 listener |
| --- | --- |
| `protocols h1 h2` | 0 — no HTTP/3 |
| `protocols h1 h2 h3` | 1 — HTTP/3 enabled |

⚠️ The list decides **HTTP/3**, and only HTTP/3. Listing `h1` alone does not
turn HTTP/2 off: with `protocols h1`, a client that offered `h2` still
negotiated HTTP/2. The only thing the server reads from the list is whether `h3`
is in it, so no setting disables HTTP/2. Without a `protocols` line, HTTP/3 is
on.

Per site, `http3 off` is meant to take one name out of HTTP/3 while the QUIC
listener keeps serving the others:

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

⚠️ In v0.2.0-rc.3 this option is accepted and has no effect. **Next release:**
it takes effect, and the site stops advertising HTTP/3 in `Alt-Svc`.

## 🏛️ Certificate sources

Three sources, all shown on the [HTTPS page](/start/https/):

| Source | Configuration | What it is for |
| --- | --- | --- |
| Let's Encrypt | a bare public name | Public names, renewed in the background. |
| Internal authority | `tls internal` | Lab names, private origins, tunnels. |
| Your own files | `tls { cert … key … }` | Certificates issued elsewhere. |

Renewal runs in the background. The global `renewal_window_ratio` option sets
how early it starts, as a fraction of each certificate's lifetime.

## 🔐 Client certificates

`client_auth` makes the server ask the client for a certificate. Create a small
authority and a client certificate with `openssl`, then point the site at the
authority's certificate **file**:

```caddyfile
https://internal.test {
    tls {
        internal
        client_auth {
            mode require_and_verify
            trusted_ca_cert_file /etc/pingclair/client-ca.crt
        }
    }
    file_server /srv/site
}
```

Measured: a request without a client certificate fails the handshake, and the
same request with `--cert client.crt --key client.key` answers `200`.

The modes are `request`, `require`, `verify_if_given`, and
`require_and_verify`. A misspelled mode is refused with the whole list
`(expected request, require, verify_if_given or require_and_verify)`.

⚠️ `trusted_ca_cert` takes the certificate itself, base64-encoded on one line,
and `trusted_ca_cert_file` takes a path. Giving a path to the first compiles,
then fails at startup with `trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45`
— the `-` of `-----BEGIN`. The file also has to be readable by the `pingclair`
user.

## 📦 Moving the certificate store

The store holds the issued certificates, the ACME account, and the internal
authority. For a package install it is `/var/lib/pingclair/.local/share/pingclair`,
the data directory under the service account's home. A command run as another
user looks in that user's own data directory, so the examples set
`PINGCLAIR_TLS_STORE`; without it, root would use `/root/.local/share/pingclair`.
`storage-export` and `storage-import` move the store:

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/.local/share/pingclair
sudo mkdir -p /var/lib/pingclair/.local/share/pingclair && sudo chown pingclair:pingclair /var/lib/pingclair/.local/share/pingclair
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/.local/share/pingclair
```

Three details from the run. The archive is a **plain tar** whatever its name,
written with mode `600`, so reading it back needs root. The import restores the
ownership recorded in the archive. And the store holds `autosave.json`, the
configuration the Admin API last applied, so an import restores that too.

**Next release:** the internal authority is filed the way Caddy files it, under
`pki/authorities/local/`. The old `internal/` directory is not migrated: the
server creates a new authority, and every client must trust the new root
again (`pingclair trust`). A global `storage file_system <path>` option can also
name the store in the configuration.

If the service refuses to start afterwards with
`Internal CA I/O error: Permission denied`, the store's files are not writable by
the service account; `sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair`
fixes it, and the site answers again.

## 🚫 What cannot be tuned

Pingclair recognizes these Caddy settings and refuses them, so a file never runs
with one silently dropped:

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

Cipher suites, curves, the ALPN list, and on-demand issuance are therefore
fixed by the build, not by the configuration. OCSP stapling is not performed
either. If one of them matters to you, it is a feature request, not a
configuration mistake.

## ⚠️ When it does not work

- **`client_auth` refuses to start with `not valid base64`.** A path was given to
  `trusted_ca_cert`; the file spelling is `trusted_ca_cert_file`.
- **A client with a valid certificate is rejected.** Check the CA that signed it
  is the one in `trusted_ca_cert_file`, and that the certificate has not expired.
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand` refuse the
  file.** They are not implemented; see the section above.
- **HTTP/3 still runs after `protocols h1 h2`.** It should not, because that list
  controls it. If UDP 443 is still listening, the file that is running is
  not the file you edited ([what a reload means](/start/service/#-what-a-reload-means)).
- **The service will not start after moving a store.** Ownership, as above.

## 🧭 Next steps

- [HTTPS](/start/https/): the four ways to get a certificate, with their exact
  log lines.
- [HTTP/3](/guides/http3/): turning it on and proving a client used it.
- [`tls`](/reference/directives/#tls): the directive reference.
