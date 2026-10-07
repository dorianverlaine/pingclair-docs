---
title: Quickstart
h1_emoji: '🏃'
sidebar:
  order: 2
description: Write a first Pingclairfile, validate it, run it in the foreground or the background, and serve a real directory.
---

After [installation](/start/install/), follow these steps to create and
validate a configuration, start the server, and verify its response.

## 🧾 Before you start

The installed service listens on port 80 and uses
`/etc/Pingclair/Pingclairfile`. Stop it before testing to free its ports:

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

Three details matter:

- The unnamed block at the top holds global options. `admin` opens the Admin
  API, which `pingclair start`, `stop`, and `reload` use to reach the running
  server.
- The `http://` scheme in the site address forces plaintext. Without it,
  Pingclair treats `localhost` as a name, serves HTTPS with a certificate from
  its own authority, and a plain HTTP client sees an empty reply
  ([HTTPS](/start/https/)).
- The `file_server` root is relative to the working directory.

## 2. ✅ Validate before you run

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` reads `./Pingclairfile` by default and also detects `./Caddyfile`. It
compiles the configuration and applies semantic checks, such as whether
certificate paths exist. A configuration that fails validation does not run,
and the output prints the reason on the last line.

<span id="3--read-what-the-configuration-becomes"></span>

## 3. 🧭 Inspect the compiled configuration

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

The compiled JSON is the configuration used by the server. Check this output
when a directive behaves unexpectedly. To inspect formatting changes, run:

```bash
pingclair fmt --diff
```

`fmt` prints the canonical form, which uses one tab per indentation level.

## 4. 🚀 Run it

In the foreground, where the log stays attached to your terminal:

```bash
pingclair run Pingclairfile
```

For local development, add `--watch` to reload the configuration after each
file change:

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

To keep the server running after the shell exits, start it in the background:

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

`ETag` and `Last-Modified` mean the file server read the file from disk. The
body is `public/index.html`. To stop a background server:

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ Servers in one command

Three subcommands run without a configuration file and are suitable for local
tests or temporary environments:

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

The service loads `/etc/Pingclair/Pingclairfile`. Copy the configuration there
to apply it when the service starts, including after a reboot:

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

`pc service reload` requests a configuration reload by sending
`SIGUSR1`. `pingclair reload` reaches the same code through the Admin API and
reports the reload result, but it requires the `admin` global option.
`sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` sends the
signal directly, with no Admin API needed.

Validate first either way, and check the result afterwards. `systemctl reload`
reports only that the signal was delivered; the reload result — applied, or
refused with a reason — appears on the unit's status line and in the journal. A
refused reload leaves the previous configuration serving.
[Run it as a service](/start/service/#-what-a-reload-means) covers the details.

<span id="️-when-it-does-not-work"></span>

## ⚠️ Troubleshooting

- **`Address already in use`.** The installer's service still holds `:80`, or
  another process holds your port. `sudo ss -ltnp | grep :80` names the owner;
  `sudo pc service stop` frees the default one.
- **`Empty reply from server` on `http://localhost:8080`.** The request uses
  plaintext HTTP with a TLS listener. Add the `http://` scheme to the site
  address, or use `https://` and trust the internal certificate.
- **`Cannot reach admin API at 127.0.0.1:2019`.** The configuration has no
  `admin` option, so nothing is listening for `pingclair stop` and
  `pingclair reload`. Add it to the global options block, or stop the foreground
  process with Ctrl-C.
- **`curl` does not complete a loopback request.** A system proxy may be
  intercepting the request. Repeat it with `curl --noproxy '*'`.
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
