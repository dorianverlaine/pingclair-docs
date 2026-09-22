---
name: configure-pingclair
description: Write, validate, and run a Pingclairfile that serves static files or reverse-proxies a backend application.
---

# Configure Pingclair

Use this skill when writing or reviewing a `Pingclairfile` — the
Caddyfile-compatible configuration language Pingclair reads.

## Prerequisites

- A Pingclair installation (`pingclair version` answers).
- A directory to serve, or a backend application to proxy.

## Steps

1. Write a `Pingclairfile`. A site block is one address plus directives:

   ```caddyfile
   localhost:8080 {
       file_server ./public
   }
   ```

2. Validate before running. Validation is not advisory: a configuration that
   fails does not run.

   ```bash
   pingclair validate
   ```

   `validate` reads `./Pingclairfile` by default and also detects `./Caddyfile`.
   It compiles the configuration and applies semantic checks such as whether
   certificate paths exist.

3. Inspect the compiled form when a directive does not behave as expected:

   ```bash
   pingclair adapt --pretty   # print the compiled JSON form
   pingclair fmt --diff       # show formatting changes without writing them
   ```

4. Run it:

   ```bash
   pingclair run Pingclairfile
   ```

   The process logs each listener it opens and serves until it receives a
   termination signal.

5. Verify from a second terminal:

   ```bash
   curl -i http://localhost:8080/
   ```

   A static response carries `ETag` and `Last-Modified`.

6. To place Pingclair in front of a backend instead, replace the directives with
   a reverse proxy and validate again:

   ```caddyfile
   localhost:8080 {
       reverse_proxy localhost:3000
   }
   ```

## Failure modes

- A request that hangs on loopback is usually a system proxy intercepting it.
  Repeat with `curl --noproxy '*'` before debugging the configuration.
- Directive names, arguments, and defaults are documented per directive at
  `/reference/directives/`. Do not guess Caddyfile behavior that Pingclair
  documents differently; the reference lists the differences.

## Source

- <https://pingclair.com/start/quickstart.md>
- <https://pingclair.com/reference/directives.md>
