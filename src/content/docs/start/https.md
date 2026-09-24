---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: Get a certificate for a public name, publish an internal certificate, or bring your own, and verify what the server actually serves.
---

A site block whose address is a public name gets HTTPS without a `tls`
directive: Pingclair asks Let's Encrypt for a certificate over ACME, answers the
HTTP-01 challenge on port 80, stores the result, and renews it in the
background. The other three ways to get a certificate — DNS-01, a local
authority, and files you supply — are covered below with what each one
requires.

## 🧾 Before you start

- A name that resolves to this host. Check it before blaming the server:
  `dig +short A example.com`.
- Ports 80 and 443 reachable from the internet. The HTTP-01 challenge is served
  on port 80, and the certificate is used on 443.
- An email address for the ACME account. It must be a real mailbox: Let's
  Encrypt refuses the reserved example domains, and the issuance fails with
  `contact email has forbidden domain "example.com"`.

The configuration below replaces `/etc/Pingclair/Pingclairfile`, which the
service runs. Validate before reloading; [Quickstart](/start/quickstart/) shows
that loop and [Run it as a service](/start/service/) explains the reload.

## 🌐 Certificates from Let's Encrypt

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

There is nothing else to configure. At startup the server authorises the
hostname, starts the ACME flow, and serves the challenge:

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

The challenge request in the access log comes from the certificate authority,
not from a browser:

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

Verify what is actually served, from another machine:

```bash
curl -I https://example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
etag: "493b-6ab1f452"
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

```text
subject=CN=example.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 22 02:35:03 2026 GMT
notAfter=Dec 21 02:35:02 2026 GMT
```

The certificate material is kept in the service user's data directory,
`/var/lib/pingclair/.local/share/pingclair` — the path the binary resolves from
that account's home, which is also what `PINGCLAIR_TLS_STORE` names when a
command runs as somebody else.

## 📡 DNS-01 and wildcards

DNS-01 proves control of a name by publishing a TXT record instead of answering
on port 80. A wildcard certificate requires it, and so does a host whose port 80
is closed.

⚠️ **DNS-01 does not complete in v0.2.0-rc.3.** That release publishes the
wrong value in the TXT record, so every order ends `Invalid`. The fix, and the
single wildcard certificate described below, are on `main` and not yet
released. To use DNS-01 today, install `main` with the installer's `--main`
flag ([Install](/start/install/#-install-from-a-release-binary)). The output
in this section shows the behavior of that build.

The configuration needs the provider block:

```caddyfile
{
    email bonjour@pingclair.com
}

*.example.com {
    tls {
        auto
        dns cloudflare <token>
        resolvers 1.1.1.1
        propagation_delay 10s
    }
    file_server /var/lib/pingclair/html
}
```

Two details are easy to miss. First, the `auto` line inside the block is what puts the
name on the issuance list; without it the server logs `authorised for 0
hostname(s)` and never asks for a certificate, leaving every handshake to fail
with `NO_CERTIFICATE_SET`. Second, the token is a Cloudflare API token with
`Zone:DNS:Edit` for the zone that holds the name.

🃏 **One leaf covers the site.** A `*.example.com` site orders `*.example.com`
itself: one certificate, obtained at startup, served to every name beneath it.
A wildcard covers exactly one label, so the apex needs its own entry — write
`*.example.com, example.com` if the site answers at `example.com` too, and each
subject is ordered as written. The subdomains served this way stay out of
Certificate Transparency logs, which is the privacy argument for a wildcard in
the first place.

Any name under the site is served by that one leaf. From another machine:

```bash
curl -I https://anything.example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername anything.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName
```

```text
subject=CN=*.example.com
issuer=C=US, O=Let's Encrypt, CN=YE1
X509v3 Subject Alternative Name:
    DNS:*.example.com
```

## 🏛️ Certificates from the internal authority

For private origins — a tunnel, an internal hostname, a lab machine — Pingclair
can be its own authority:

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

The site answers with a certificate issued by `CN=Pingclair Local Authority` for
ten years, and the root is published in the store:

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

Clients do not trust it yet, so a request without `-k` fails. Install the root
into the system trust store:

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

The `PINGCLAIR_TLS_STORE` prefix matters: `pingclair trust` looks in the store of
the user who runs it, which for root is `/root/.local/share/pingclair`, while the
service uses `/var/lib/pingclair/.local/share/pingclair`. Without the prefix it answers `No
internal CA root at /root/.local/share/pingclair/internal/root.crt`.

After trusting the root, the same request succeeds without `-k`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` removes it again, with the same store prefix.

📌 **Next release.** The next release files the internal authority the way Caddy
does, under `pki/authorities/local/` in the store, with an intermediate that
signs the leaves. The old `internal/` directory is not migrated: after the
upgrade the server creates a new root, and every client must trust it again
with `pingclair trust`.

## 📜 Certificates you supply

When another system issues your certificates, point `tls` at the files:

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

The files must be readable by the `pingclair` user, because the service runs as
that user. `validate` refuses a path that does not exist rather than failing at
the first handshake:

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ When HTTPS does not come up

- **`contact email has forbidden domain "example.com"`.** Let's Encrypt rejects
  the reserved example domains as account contacts. Put a real mailbox in the
  `email` option.
- **`NO_CERTIFICATE_SET` in the log.** The handshake presented a name the server
  has no certificate for. Read the log above it: a `tls` block without `auto`
  never starts issuance, and DNS-01 does not complete in this release.
- **The challenge is never served.** Port 80 is blocked by a firewall, or
  something else holds the port. The authority has to reach
  `http://your-name/.well-known/acme-challenge/` from the internet.
- **The name does not resolve to this host.** `dig +short A your-name` shows
  what the authority will connect to, which is not always what you expect after
  a recent change.
- **Repeated failures.** Let's Encrypt rate-limits failed validations per
  hostname. Fix the cause before retrying, or the retries themselves become the
  error.

## 🧭 Next steps

- [Run it as a service](/start/service/): the unit, its reload semantics, and
  its logs.
- [`tls`](/reference/directives/#tls): every mode and option of the directive.
- [Pingclairfile](/reference/pingclairfile/): addresses, matchers, and what the
  compiler accepts.
