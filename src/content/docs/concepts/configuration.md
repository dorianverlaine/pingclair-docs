---
title: Configuration model
h1_emoji: '🧠'
description: How a Pingclairfile is structured, how it is compiled and validated before any request arrives, how routes are chosen, and what a reload changes.
---

Pingclair compiles the Pingclairfile when it loads the configuration. Address
parsing and matcher compilation are completed before requests are processed,
and unsupported or invalid settings are rejected at load time. This page
describes configuration loading and reload behavior in **v0.2.2**.

## 🗂️ A file is global options followed by site blocks

```caddyfile
{
    email admin@example.com
}

example.com {
    encode zstd gzip
    reverse_proxy 10.0.0.10:8080 10.0.0.11:8080
}

:8080 {
    file_server ./public
}
```

- **Global options** go in an unnamed block at the top of the file. They
  configure what is not specific to one site: the ACME account email, the Admin
  API, automatic HTTPS, trusted proxies, and DNS refresh for hostname
  upstreams. The [directive reference](/reference/directives/#global-options)
  lists them.
- **Site blocks** are named by address: a host, a port, or both. The port is
  part of the address rather than a separate directive, so the address and the
  listener cannot disagree.
- **Directives** are the statements inside a site block. Some take arguments,
  some take a nested block, and some take both.
- **Comments** start with `#` and run to the end of the line.
- **Values that contain spaces are quoted.** Durations carry a unit: `30s` is
  thirty seconds, and a bare `30` is refused where a duration is expected.

## 🧭 Matchers select the requests a directive applies to

A named matcher is declared with `@name` and used by writing that name after
the directive:

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

A `handle` block groups the directives for one route. Only one `handle` block
answers a request, and a `handle` with no matcher matches requests not handled by the other blocks:

```caddyfile
example.com {
    handle /assets/* {
        file_server ./assets
    }

    handle {
        respond "Page Not Found" 404
    }
}
```

## 🚦 Which route answers a request

Routes are ranked by directive, and the first matching route answers. `redir`, `handle`, and `route` precede `respond`; `respond` precedes `reverse_proxy`, `php_fastcgi`, and `file_server`. Within one directive, single paths sort by length after removing a trailing `*`, then exact before the corresponding wildcard, then file order. Multiple-path and pathless matchers follow single-path routes.

Use exclusive `handle` blocks to separate routes, or `route` to retain written order. Path comparisons ignore ASCII letter case and decode percent escapes once; use `path_regexp` when case matters. `handle`, `handle_path`, and `route` accept only `*`, a path beginning with `/`, or `@name` before the block, and refuse a bare token such as `*.php`.

[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) · [Pingclairfile](/reference/pingclairfile/)

## 🧩 Snippets and imports reuse configuration

A snippet is a reusable fragment declared as `(name) { ... }` and inserted with
`import name`. The caller can pass arguments and a block; the snippet receives
the block where it writes `{block}`:

```caddyfile
(site) {
    https://{args[0]} {
        {block}
    }
}

import site example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Snippets defined in an imported file are visible to the imports that follow
it. A placeholder inside a directive's argument list is refused: Caddy
re-reads the line after inserting the snippet, and Pingclair's parser cannot.
Pingclair therefore rejects the construct instead of inferring its intended
meaning.

<span id="️-validation-refuses-what-the-server-cannot-do"></span>

## 🛡️ Validation rejects unsupported settings

`pingclair validate` compiles the file and applies the checks that need more
than syntax: directive arguments, matcher syntax, whether certificate and key
files exist, and policy constraints such as which peers may set client-identity
headers.

A configuration that fails these checks does not run. Three rules decide what
fails:

- **An unimplemented name is refused by name.** Pingclair recognizes every name
  the Caddyfile format defines. A name it does not implement produces a message
  identifying the unsupported feature, and the configuration is rejected.
- **Unsupported options are rejected.** `encode br`
  is a compile error, because there is no streaming Brotli encoder; the server
  does not automatically substitute gzip.
- **Correct syntax that points at missing files is still an error.** The server
  repository's `examples/full_featured.pingclair` is valid syntax, and
  `validate` still rejects it on a machine where the certificate paths it names
  do not exist.

The server runs the same checks when it loads a file, including on a reload.

## 🔁 A reload swaps the configuration without a restart

A reload reads the file again, compiles it, and swaps the result in while the
process keeps running. If the new file fails to compile, the previous
configuration keeps serving. There are three ways to initiate a reload:

- `pc service reload` (or `systemctl reload pingclair`) sends `SIGUSR1` through
  the installed unit.
- `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` sends the
  same signal directly.
- `pingclair reload` goes through the Admin API and prints the reload result. It needs the `admin` global option.

`systemctl reload` can only report that the signal was delivered, so the
reload result appears on the unit's status line and in the journal.

Some changes cannot be applied by a reload, and the server refuses the reload
and keeps the old configuration rather than applying part of it:

- **Listener changes.** Adding, removing, or moving an address, or switching a
  listener between plaintext and TLS, requires a restart, because listening
  sockets are created at startup. On Unix, an admin-only startup may load its
  first plaintext HTTP generation; TLS and later topology changes require a restart.
- **Global options.** Options established at startup, such as
  `trusted_proxies`, apply to the whole process, so changing those policies requires a restart. Process-log settings can reload.
- **Certificate topology.** Adding a TLS hostname, or changing how a site gets
  its certificate, requires a restart.

The refusal names the change, for example `listener topology changed (added:
…, removed: …)`, and `sudo pc service restart` applies it.

[Run it as a service](/start/service/#-what-a-reload-means) describes each reload outcome.

## 🧭 Related pages

- [Pingclairfile](/reference/pingclairfile/): the language in full.
- [Directive reference](/reference/directives/): every directive and option.
- [Architecture](/concepts/architecture/): what runs the compiled
  configuration.
