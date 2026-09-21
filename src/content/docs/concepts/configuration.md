---
title: Configuration model
description: How a Pingclairfile is parsed, compiled, validated, and turned into runtime state.
---

A Pingclairfile is compiled once, at load time, into the runtime state the
server executes. Two consequences follow, and they explain most of the
project's behavior: work that configuration can decide happens before the first
request, and a configuration that cannot be honored stops the server instead of
degrading at request time.

## 🗂️ File structure

A file contains an optional global options block, followed by one or more site
blocks.

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

- **Global options** are written in an unnamed block that comes first. They
  configure state that is not per-site: the ACME account email, the Admin API,
  automatic HTTPS behavior, trusted proxies, and DNS refresh for hostname
  upstreams. The available options are listed in the
  [directive reference](/reference/directives/#global-options).
- **Site blocks** are named by address: a host, a port, or both. The port is
  part of the address rather than a separate directive, so there is one place
  where the address and the listener have to agree.
- **Directives** are the statements inside a site block. Some take an argument
  list, some take a nested block, and some accept both.
- **Comments** begin with `#` and run to the end of the line.
- **Values with spaces are quoted.** Durations carry a unit: `30s` is thirty
  seconds, while a bare `30` is refused where a duration is expected.

## 🧭 Matchers

A matcher selects the requests a directive applies to. Named matchers are
declared with `@name` and referenced by name:

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

`handle` blocks group behavior per route and support a fallback with no
matcher:

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

## 🧩 Snippets and imports

A snippet is a reusable fragment declared as `(name) { ... }` and pulled in with
`import name`. A snippet can receive a block from its caller, which is spliced
where the snippet writes `{block}`:

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

Snippet definitions in an imported file are visible to imports that follow.
Placeholders inside an argument list are refused, because the directive tree
cannot re-parse a line after splicing the way the token layer does.

## 🛡️ Validation

`pingclair validate` compiles the file and applies semantic checks: directive
arguments, matcher syntax, certificate and key paths, and policy constraints
such as which peers may assert client identity headers.

Failures are closed and explicit:

- **Unimplemented names are refused by name.** Every name the format defines is
  recognized, and one that the server does not implement produces a message
  saying the feature is missing. It is never read as a typo and never ignored:
  a configuration containing one does not start.
- **Options that cannot be honored are refused, not downgraded.** Asking for
  Brotli in `encode` is a compile error, because the proxy has no streaming
  Brotli encoder; the server does not quietly serve gzip instead.
- **Valid files that refer to missing material are still rejected.** The
  repository's `examples/full_featured.pingclair` is valid Caddyfile syntax and
  is still rejected, correctly, because the certificate paths it names do not
  exist on the machine running the check.

The same checks run at load time, so a configuration that fails during a reload
leaves the previous state in place.

## 🔁 Reloads

`pc service reload` re-reads the configuration without restarting the process.
Process-wide policy that is established during startup, such as
`trusted_proxies`, takes effect only after a restart.
