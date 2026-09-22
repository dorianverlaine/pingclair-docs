---
title: Quickstart
h1_emoji: '🏃'
sidebar:
  order: 2
description: Write a first Pingclairfile, validate it, run it in the foreground or the background, and serve a real directory.
---

This page goes from an installed host to a running server you control: a
configuration on disk, a validated compile, a server you can start, stop, and
watch, and a verification step that proves the file server answered. It assumes
the [installation](/start/install/) is done.

## 🧾 Before you start

The installer left a service running on port 80, and that service holds the
configuration in `/etc/Pingclair/Pingclairfile`. Stop it while you experiment so
the ports are free:

```bash
sudo pc service stop
```

```bash
mkdir -p ~/demo/public
cd ~/demo
echo '<h1>hello from ~/demo/public</h1>' > public/index.html
```

## 1. ✍️ Write a configuration

Create `~/demo/Pingclairfile`:

```caddyfile
{
    admin 127.0.0.1:2019
}

http://localhost:8080 {
    file_server ./public
}
```

Three things are worth naming. The unnamed block at the top holds global
options, and `admin` is what lets `pingclair start`, `stop`, and `reload` talk to
the running server. The site address carries the scheme, and `http://` is what
forces plaintext; without it Pingclair treats `localhost` as a name and serves
HTTPS from its own certificate authority, which a plain HTTP client sees as an
empty reply ([HTTPS](/start/https/)). The `file_server` root is relative to the
working directory.

## 2. ✅ Validate before you run

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` reads `./Pingclairfile` by default and also detects `./Caddyfile`. It
compiles the configuration and applies semantic checks, such as whether
certificate paths exist. Validation is not advisory: a configuration that fails
does not run, and a failing one prints the reason on the last line.

## 3. 🧭 Read what the configuration becomes

```bash
pingclair adapt --pretty
```

```text
{
  "debug": false,
  "servers": [
    {
      "name": "localhost",
      "names": [
        "localhost"
      ],
      "listen": [
        "[::]:8080"
      ],
```

The compiled JSON is the form the server actually runs. When a directive does
not behave as the documentation says, this is the first place to look. To see
what `pingclair fmt` would change in the file instead:

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` prints the canonical form, which indents with two spaces.

## 4. 🚀 Run it

In the foreground, where the log stays attached to your terminal:

```bash
pingclair run Pingclairfile
```

```text
🚀 Starting Pingclair with config: Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: Pingclairfile
🔧 Configured 1 server(s)
🔐 Auto HTTPS: enabled
```

Add `--watch` to reload the configuration every time you save it, which is the
development loop:

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

Or run it in the background, where it survives your shell:

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`, `stop`, and `reload` reach the running server through the
Admin API, which is why the configuration above sets `admin`. `pingclair run`
does not need it.

## 5. 🔍 Verify

```bash
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 34
Last-Modified: Tue, 22 Sep 2026 03:26:39 GMT
ETag: "22-6ab1f56f"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag` and `Last-Modified` mean the file server read the file from disk. The
body is `public/index.html`. To stop a background server:

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ Servers in one command

Three subcommands serve without a configuration file, which is useful for
trying something out or for a throwaway host:

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

Each prints its listener on startup:

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

Every request to `:8082` is proxied to the file server on `:8081`, and `:8083`
answers with the body you passed. `respond` is for development only.

## 🔁 Move it into the service

The service runs `/etc/Pingclair/Pingclairfile`, so putting your configuration
there is what makes it survive a reboot:

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
curl -i http://localhost/
```

`SIGUSR1` is the reload signal, and it works without any further configuration.
`pingclair reload` does the same through the Admin API and also reports what the
server thought of the file, which needs the `admin` option from the global
options block.

Validate first either way. `pc service reload` looks like the obvious command
and is not: the installed unit sends `SIGHUP`, which the server drops, so it
reports success while the old configuration keeps serving
([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)).

## ⚠️ When it does not work

- **`Address already in use`.** The installer's service still holds `:80`, or
  another process holds your port. `sudo ss -ltnp | grep :80` names the owner;
  `sudo pc service stop` frees the default one.
- **`Empty reply from server` on `http://localhost:8080`.** You are speaking
  plaintext to a TLS listener. Add the `http://` scheme to the site address, or
  talk to it with `https://` and trust the internal certificate.
- **`Cannot reach admin API at 127.0.0.1:2019`.** The configuration has no
  `admin` option, so nothing is listening for `pingclair stop` and
  `pingclair reload`. Add it to the global options block, or stop the foreground
  process with Ctrl-C.
- **`curl` hangs on a loopback address.** A system proxy is intercepting the
  request. Repeat it with `curl --noproxy '*'`.
- **Validation fails with `Unsupported feature`.** The directive is recognized
  but not implemented, and the message names the alternative, as in
  `encode br`: Brotli is not implemented for proxied responses, so the message
  points at `encode zstd gzip`.

## 🧭 Next steps

- [HTTPS](/start/https/): certificates for a public name, from Let's Encrypt or
  the internal authority.
- [Run it as a service](/start/service/): the unit, its reload semantics, and
  its logs.
- [Pingclairfile](/reference/pingclairfile/): the language itself, including
  matchers, snippets, and imports.
