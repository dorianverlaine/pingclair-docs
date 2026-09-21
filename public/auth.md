# auth.md

The Pingclair documentation is public. No page, endpoint, or file on this site
requires an account, a token, or a registration step.

## Audience

This document is written for agents that discover `auth.md` while looking for
an authentication and registration entrypoint. There is nothing to register
for.

## Registration

None. There is no provisioning endpoint, no API key issuing service, and no
credential store behind this hostname. Requests to any `/agent/auth` style path
return 404 because no such route exists.

## Authentication methods

None are supported or required:

| Method | Status |
| --- | --- |
| Anonymous access | Supported, and the only mode |
| API key or bearer token | Not used |
| OAuth 2.0 | No authorization server is operated for this site |
| mTLS | Not used |

Because no OAuth authorization server exists here, this site publishes no
`/.well-known/oauth-protected-resource` or
`/.well-known/oauth-authorization-server` document. Publishing either without a
real authorization server would mislead agents that follow them.

## Machine-readable entry points

- `/llms.txt` and `/llms-full.txt`: the documentation as Markdown for models.
- Every page answers with Markdown when requested with `Accept: text/markdown`.
- `/sitemap.xml`: the canonical page list.
- `/.well-known/agent-skills/index.json`: documentation skills published here.
- `/robots.txt`: crawl rules and content signals.

## Rates and limits

Static files are served through Cloudflare. There is no per-agent quota, key,
or allowlist. Please cache responses rather than polling.
