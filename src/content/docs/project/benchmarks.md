---
title: Benchmarks
description: What is measured, under which conditions, and where the numbers come from.
---

Pingclair is measured against nginx and Caddy on the same host, with every
candidate running in a container capped at two CPUs, the same worker count, and
the same 1 KiB payload. The reverse-proxy backend runs in its own container on
the same Docker network, and the load generator runs natively.

## 📊 Results

Each value is the median of three interleaved rounds of 50,000 requests, and a
row counts only when every request succeeded.

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

Numbers are requests per second. Against nginx, Pingclair is ahead on the
HTTP/1.1, HTTPS/1.1, and HTTP/2 static rows (1.2x, 1.3x, and 2.2x
respectively), while HTTP/3 static is effectively level. On the reverse-proxy
workload it is 14% ahead on HTTP/2 and 26% ahead on HTTP/3, while HTTP/1.1 and
HTTPS/1.1 remain about 8% behind nginx.

## 📐 Conditions that limit these numbers

- **The host is a laptop.** The measurements ran on an Apple M2 with OrbStack.
  Absolute throughput is not a capacity claim, and the ratios describe relative
  performance under this controlled workload only.
- **Rows compare within a protocol.** HTTP/3 uses a different load generator
  from the other rows, so absolute throughput should not be compared across
  protocols, only between servers within a row.
- **Incomplete rows are not comparisons.** On this host and harness, Caddy did
  not complete the proxied HTTP/2 and HTTP/3 rows: upstream connection churn
  exhausted the container's available ephemeral ports at the tested
  concurrency. Those cells are reported as incomplete rather than measured
  under a different workload.
- **The results are host-dependent.** The relative position of the servers
  changes with CPU architecture, kernel, worker count, and TLS implementation.

## 🧾 Source

The methodology, configuration files, harness, and the complete result tables
live in the server repository:

- [Benchmark methodology](https://github.com/dorianverlaine/pingclair/blob/main/benchmarks/README.md)
- [Current results section](https://github.com/dorianverlaine/pingclair#-benchmarks)

Raw run evidence is kept locally by the maintainer and is intentionally not
published.
