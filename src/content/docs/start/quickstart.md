---
title: Quickstart
h1_emoji: '🏃'
description: Write a first Pingclairfile, validate it, and serve traffic.
---

This page takes a fresh installation to a running server: a static site on port
8080, then a reverse proxy in front of a backend application.

## 1. ✍️ Write a configuration

Create a file named `Pingclairfile`:

```caddyfile
localhost:8080 {
    file_server ./public
}
```

The file contains a single site block. `localhost:8080` is the address the site
answers on, `file_server` serves files, and `./public` is the directory they are
read from, relative to the working directory.

## 2. ✅ Validate it

```bash
pingclair validate
```

`validate` reads `./Pingclairfile` by default; `./Caddyfile` is also detected.
It compiles the configuration, applies semantic checks such as whether
certificate paths exist, and exits non-zero when something is wrong. Validation
is not advisory: a configuration that fails does not run.

Two related commands are useful while writing configuration:

```bash
pingclair adapt --pretty   # print the compiled JSON form
pingclair fmt --diff       # show formatting changes without writing them
```

## 3. 🚀 Run it

```bash
pingclair run Pingclairfile
```

The process logs each listener it opens, then serves requests until it receives
a termination signal.

## 4. 🔍 Verify

In a second terminal:

```bash
curl -i http://localhost:8080/
```

Expect `200` with `ETag` and `Last-Modified` headers for the file that was
served.

If the request hangs instead, check whether a system proxy is intercepting
loopback traffic and repeat the request with `curl --noproxy '*'`.

## 5. 🔁 Proxy an application

Replace the site block with a reverse proxy in front of a backend listening on
port 3000:

```caddyfile
localhost:8080 {
    reverse_proxy localhost:3000
}
```

Validate and run again with the same commands. The response now comes from the
backend. Multiple upstreams, load-balancing policy, health checks, and failure
behavior are described under [`reverse_proxy`](/reference/directives/#reverse_proxy).

## 6. 🔒 Terminate TLS

Public names obtain certificates automatically:

```caddyfile
{
    email admin@example.com
}

example.com {
    reverse_proxy localhost:3000
}
```

Automatic HTTPS requires the site address to be a public name and the ACME
challenge to reach the server, which normally means port 80. For private
origins, `tls internal` issues from a local certificate authority instead;
clients must trust its root, published at
`$PINGCLAIR_TLS_STORE/internal/root.crt`.

## 7. ⚙️ Run as a service

The installer creates a `systemd` unit that the `pc` command manages:

```bash
pc service start
pc service status
pc service reload   # re-read the configuration without restarting
```

## 🧭 Next steps

- [Configuration model](/concepts/configuration/)
- [Architecture](/concepts/architecture/)
- [Directive reference](/reference/directives/)
