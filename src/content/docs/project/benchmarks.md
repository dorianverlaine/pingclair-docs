---
title: Benchmarks
h1_emoji: '📊'
description: How Pingclair compares with nginx and Caddy on one controlled workload, the conditions of that measurement, and what the numbers do not show.
---

A throughput number means something only next to the conditions that produced
it. This page gives the latest comparison and, beside it, every condition that
limits what it shows.

## 🧭 How the comparison was run

- **Versions.** Pingclair `v0.2.0-rc.3` (the release binary), nginx 1.31.6, and
  Caddy 2.11.4.
- **Host.** One Apple M2 laptop running OrbStack.
- **Limits.** Every server runs in a container capped at two CPUs, with the
  same worker count and the same 1 KiB payload.
- **Topology.** The reverse-proxy backend runs in its own container on the same
  Docker network.
- **Load generator.** HTTP/1.1, HTTPS/1.1, and HTTP/2 use a native `h2load`.
  HTTP/3 uses an ngtcp2-enabled `h2load` inside the same Docker network.

## 📊 Results

Each value is requests per second: the median of three interleaved rounds of
50,000 requests. A row counts only when every request succeeded.

| Scenario | Pingclair | nginx 1.31.6 | Caddy 2.11.4 |
| --- | ---: | ---: | ---: |
| HTTP/1.1 static | 46,125 | 39,478 | 18,266 |
| HTTPS/1.1 static | 40,721 | 31,508 | 19,978 |
| HTTP/2 static | 92,369 | 41,972 | 17,424 |
| HTTP/3 static | 56,180 | 55,638 | 22,912 |
| HTTP/1.1 reverse proxy | 20,856 | 22,584 | 17,117 |
| HTTPS/1.1 reverse proxy | 20,297 | 21,944 | 16,660 |
| HTTP/2 reverse proxy | 23,181 | 20,396 | not completed |
| HTTP/3 reverse proxy | 28,078 | 22,213 | not completed |

Against nginx, Pingclair is ahead on the
HTTP/1.1, HTTPS/1.1, and HTTP/2 static rows (1.2x, 1.3x, and 2.2x
respectively), while HTTP/3 static is effectively level. On the reverse-proxy
workload it is 14% ahead on HTTP/2 and 26% ahead on HTTP/3, while HTTP/1.1 and
HTTPS/1.1 remain about 8% behind nginx.

## 📐 Conditions that limit these numbers

- **The host is a laptop.** Absolute throughput is not a capacity claim, and the ratios describe relative
  performance under this controlled workload only.
- **Compare within a row.** The HTTP/3 load generator runs in a different
  environment from the others, so absolute throughput should not be compared across
  protocols, only between servers within a row.
- **Incomplete rows are not comparisons.** On this host and harness, Caddy did
  not complete the proxied HTTP/2 and HTTP/3 rows: upstream connection churn
  exhausted the container's available ephemeral ports at the tested
  concurrency. Those cells are reported as incomplete rather than measured
  under a different workload.
- **The results are host-dependent.** The relative position of the servers
  changes with CPU architecture, kernel, worker count, and TLS implementation.

## 🧾 Source

The table is the one published in the server repository's README. The
methodology, the rules a run must meet before a number counts, and the harness
are in the server repository as well:

- [Benchmark methodology](https://github.com/dorianverlaine/pingclair/blob/main/benchmarks/README.md)
- [Published comparison](https://github.com/dorianverlaine/pingclair#-benchmarks)

Raw per-run evidence is not published.
