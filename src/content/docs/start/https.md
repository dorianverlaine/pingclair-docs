---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: Configure public certificates, the internal certificate authority, or certificate files, and verify the certificate served.
---

📌 TLS examples below use `./certs/` in the working directory. Supply your own certificate, matching private key, or client CA file there; validation reads these files too.

A site block with a public hostname enables HTTPS without a `tls`
directive: Pingclair obtains a certificate from Let's Encrypt over ACME, answers
the HTTP-01 challenge on port 80, stores the result, and renews it in the
background. The other three paths — DNS-01, the internal authority, and
files you supply — are covered below.

## 🧾 Before you start

- A name that resolves to this host. Verify DNS resolution before
  troubleshooting the server:
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

At startup, the server authorizes the
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

Verify the HTTPS response and certificate from another machine:

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

Certificates are stored in the service user's data directory,
`/var/lib/pingclair/.local/share/pingclair`. The binary resolves this path from
the account's home directory. When a command runs as a different user, set
`PINGCLAIR_TLS_STORE` to point at this path.

## 📡 DNS-01 and wildcards

DNS-01 proves control of a name by publishing a TXT record instead of answering
on port 80. A wildcard certificate requires it, and so does a host whose port 80
is closed.

📌 **DNS-01 supports Cloudflare; other provider names are refused.** The server publishes the ACME TXT digest and preserves other TXT records at the challenge name.

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

Two details require attention. First, the `auto` line inside the block puts the
name on the issuance list; without it the server logs `authorised for 0
hostname(s)` and never requests a certificate, so every handshake fails with
`NO_CERTIFICATE_SET`. Second, the token is a Cloudflare API token with
`Zone:DNS:Edit` for the zone that holds the name.

🃏 **One wildcard certificate covers matching subdomains.** A `*.example.com` site orders `*.example.com`
itself: one certificate, obtained at startup, served to every name beneath it.
A wildcard covers exactly one label, so the apex needs its own entry — write
`*.example.com, example.com` if the site answers at `example.com` too, and each
subject is ordered as written. Individual subdomain names are not included in the wildcard certificate's
Certificate Transparency entry.

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
can issue certificates from its internal authority:

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

The internal authority has a root and an intermediate that signs 90-day leaves. The root is at `<store>/pki/authorities/local/root.crt`.

Clients do not trust it yet, so a request without `-k` fails. Install the root
into the system trust store:

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

The `PINGCLAIR_TLS_STORE` prefix is required because `pingclair trust` looks in
the store of the user who runs it. For root, that is
`/root/.local/share/pingclair`, not the service account's store at
`/var/lib/pingclair/.local/share/pingclair`. Without the prefix, the command searches root’s own store instead of the service store.

After trusting the root, the same request succeeds without `-k`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` removes it again, with the same store prefix.

📌 **Upgrade note.** The old `internal/` directory is not migrated. Version 0.2.0 creates a new authority, and every client must trust its root again.

## 📜 Certificates you supply

When another system issues your certificates, point `tls` at the files:

```caddyfile
https://byo.test {
    tls {
        cert ./certs/byo.crt
        key ./certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

The files must be readable by the `pingclair` user, because the service runs as
that user. `validate` reads and parses the files and checks that the private key matches the certificate, without opening listeners. A missing file is refused:

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

<span id="️-when-https-does-not-come-up"></span>

## ⚠️ HTTPS setup failures

- **`contact email has forbidden domain "example.com"`.** Let's Encrypt rejects
  the reserved example domains as account contacts. Put a real mailbox in the
  `email` option.
- **`NO_CERTIFICATE_SET` in the log.** The handshake presented a name the server
  has no certificate for. Read the log above it: a `tls` block without `auto`
  never starts issuance, and verify the DNS challenge settings.
- **The challenge is never served.** Port 80 is blocked by a firewall, or
  something else holds the port. The authority has to reach
  `http://your-name/.well-known/acme-challenge/` from the internet.
- **The name does not resolve to this host.** `dig +short A your-name` shows
  what the authority will connect to, which is not always what you expect after
  a recent change.
- **Repeated failures.** Let's Encrypt rate-limits failed validations per
  hostname. Resolve the underlying cause before retrying to avoid exceeding the
  validation limit.

## 🧭 Next steps

- [Run it as a service](/start/service/): the unit, its reload semantics, and
  its logs.
- [`tls`](/reference/directives/#tls): every mode and option of the directive.
- [Pingclairfile](/reference/pingclairfile/): addresses, matchers, and what the
  compiler accepts.
