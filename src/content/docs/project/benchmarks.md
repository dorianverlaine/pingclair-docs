---
title: Performance Benchmarks
h1_emoji: '📊'
description: A controlled performance comparison of Pingclair, nginx, Caddy, and Traefik, covering reverse proxying, static file serving, Zstd compression, access logging, and HTTP/3, with detailed methodology and limitations.
---

Performance numbers are only meaningful when considered alongside the conditions under which they were measured.

This page documents a series of benchmarks conducted on October 11–12, 2026, using an OrbStack container environment running on an Apple M2 MacBook Pro. The comparison covers Pingclair, nginx, Caddy, and Traefik across reverse proxying, static file serving, dynamic Zstd compression, access logging, and HTTP/3.

All results were obtained under specific hardware, software, and workload conditions. They describe relative performance within this test environment and should not be interpreted as capacity guarantees or predictions for other deployments.

## 🧭 Methodology

This section documents the hardware, virtual machine, container configuration, software versions, and commands used to produce the results.

All four benchmark suites ran in the same virtual machine, on the same container network, using a consistent set of server images to minimize environmental differences.

### 🖥️ Host and Virtual Machine

- **Host:** MacBook Pro (2022), eight-core Apple M2, 16 GB unified memory, running macOS 27.0.1.
- **Virtual machine:** OrbStack 2.2.3, Linux kernel `7.0.14-orbstack`, configured with 8 vCPUs and 8 GB RAM. All servers under test, load generators, and backend services ran inside this Linux VM. Individual test runs were orchestrated from within the VM.
- **Container engine:** Docker 29.4.0 (OrbStack engine). All containers were connected to a dedicated bridge network, `bench-net` (`192.168.97.0/24`). Client-to-server traffic remained within the VM and did not traverse an external network.

### 📦 Versions and Images

| Component | Version | Image and Build |
| --- | --- | --- |
| Pingclair `main` | `main@0476be4a` (`0.0.0-dev`) | `bench/pingclair-main:0476be4a`; built from source with Rust 1.99.0 using `cargo build --release --locked` |
| Pingclair `v0.2.2` | `0.2.2` | `bench/pingclair:0.2.2`; official `pingclair-linux-aarch64` release binary, verified against `SHA256SUMS` |
| nginx | `1.31.6` | `bench/nginx:1.31.6`; built from official source with OpenSSL 3.5.5, GCC 15.2, and the Zstd module |
| Caddy | `2.11.7` | Official image `caddy:2.11.7` |
| Traefik | `v3.7.14` | Official image `traefik:v3.7.14` |

nginx was compiled with the following options:

```text
--with-http_ssl_module
--with-http_v2_module
--with-http_v3_module
--with-http_realip_module
--with-http_stub_status_module
--add-module=zstd-nginx-module@057a7d3
```

Zstd support was provided by the third-party `tokers/zstd-nginx-module`, pinned to commit `057a7d3`.

### ⚙️ Container and Server Configuration

All server containers used the `linux/arm64` architecture and were limited to two CPUs through Docker's `--cpus=2` option.

Configuration files, test payloads, and TLS certificates were mounted read-only. The log directory and nginx cache directory each used a 512 MB tmpfs mount to avoid introducing persistent storage latency into the measurements.

The containers were launched using the following parameter structure:

```sh
docker run -d --name sut --network bench-net --cpus=2 \
  --tmpfs /logs:size=512m \
  --tmpfs /var/cache/nginx:size=512m \
  -v <bench>/configs:/conf:ro \
  -v <bench>/payloads:/payloads:ro \
  -v <bench>/certs:/certs:ro \
  <image> <server command>
```

Each server retained its default worker or thread configuration rather than being forced into a common concurrency model. For example, nginx used `worker_processes auto` and `worker_connections 1024`.

**TLS and Listening Ports**

The tests used a self-signed TLS certificate with a common name (CN) of `sut` and subject alternative names (SANs) covering `sut`, `localhost`, and `127.0.0.1`.

HTTPS traffic used TCP port 8443. The HTTP/3 suite additionally used UDP port 8443.

**Static Files**

Three payload sizes were used:

| File | Size |
| --- | ---: |
| `index.html` | 226 B |
| `small.bin` | 10 KiB |
| `medium.bin` | 2 MiB |

**Reverse Proxy Backends**

The backend ran in a `node:22-slim` container with four Node.js HTTP server instances listening on TCP ports 3001–3004.

Each instance used a listen backlog of 4096 and returned a fixed 16-byte JSON response.

All four reverse proxies used round-robin load balancing with upstream connection reuse. nginx was configured with `keepalive 64`, while Traefik used `maxIdleConnsPerHost: 64`.

Connection pooling semantics differ between implementations. These settings therefore represent approximately comparable configuration targets rather than identical internal behavior.

**Access Logging**

Access logging was disabled for all throughput benchmarks except the logging overhead suite.

That suite consisted of two configurations:

- **A:** Access logging disabled.
- **B:** JSON access logging enabled, writing to a 512 MB tmpfs.

nginx used `escape=json`, while Pingclair used `format json`.

**Dynamic Zstd Compression**

The servers used the following compression settings:

| Server | Zstd Configuration |
| --- | --- |
| Pingclair | `encode zstd`, with the corresponding response type matching |
| nginx | `zstd_comp_level 3`, `zstd_min_length 256`, `zstd_types *` |
| Caddy | `encode zstd better`, with `application/octet-stream` response matching |

All configurations enabled dynamic Zstd compression. However, compression strategies, output sizes, and CPU costs may differ between implementations.

The compression benchmarks therefore compare end-to-end serving throughput under the specified configurations, not the isolated computational performance of each compression implementation.

### 🏎️ Load Generators and Commands

**HTTP/2**

HTTP/2 benchmarks used `h2load` from nghttp2 1.68.0, running inside a `client-lite` container based on Ubuntu 26.04 with `nghttp2-client` installed.

The client container shared the same bridge network as the servers under test.

Fixed-concurrency reverse proxy benchmark:

```sh
h2load -n 500000 -c 100 -t 16 -m 8 \
  https://sut:8443/
```

Static file and logging overhead benchmarks:

```sh
h2load -n 500000 -c 100 -t 16 -m 8 \
  https://sut:8443/index.html
```

The static file suite requested `index.html`, `small.bin`, and `medium.bin` separately.

The 226 B and 10 KiB workloads each consisted of 500,000 requests, while the 2 MiB workload consisted of 5,000 requests.

Zstd workloads added the following request header:

```sh
-H 'Accept-Encoding: zstd'
```

The concurrency sweep was driven by `benchmark.py`, which executed the following command at each concurrency level:

```sh
h2load -n 20000 -c <c> -t min(c, 8) \
  -m 8 -T 5 -N 5 <url>
```

The connection count `c` increased from 1 to 9,901 in increments of 100. Each point generated 20,000 requests.

**HTTP/3**

HTTP/3 benchmarks used Tencent's `tquic_client`, built from `develop@938e90a` (Cargo package version `1.6.0`) with BoringSSL.

The command was:

```sh
tquic_client -t 8 \
  --max-concurrent-conns 25 \
  --max-concurrent-requests 25 \
  --total-requests-per-thread 0 \
  -d 10 <url>
```

This suite used short-lived QUIC connections. Each connection was replaced after completing a single request, allowing the benchmark to exercise repeated connection establishment and teardown.

**Test Orchestration**

The concurrency sweep and repeated measurements were managed by a supervisor container running inside the Linux VM.

The supervisor used Ubuntu 26.04 and the Docker CLI, with access to the Docker socket through a mounted `docker.sock`. It was responsible for executing individual test cases, handling retries, and collecting results.

The macOS host was used only for final result aggregation and did not directly orchestrate individual test runs.

### 📏 Sampling and Result Validation

The suites used different request counts and repetition policies:

| Benchmark | Measurement |
| --- | --- |
| Fixed-concurrency reverse proxy | 100 connections, 500,000 requests, one run |
| Concurrency sweep | 20,000 requests per point, one run per point |
| Static files and Zstd | Two runs, median reported |
| Access logging overhead | Two runs, median reported |
| HTTP/3 | Two runs each for Pingclair and Caddy; four for nginx; median reported |

**Validity Criteria**

For the fixed-concurrency reverse proxy, static file, compression, and logging overhead benchmarks, only runs in which every request succeeded were included. Runs containing failed requests were excluded from those throughput comparisons.

The concurrency sweep was treated differently. Failed runs were retained as diagnostic observations, with error rates reported alongside throughput. Throughput figures from these runs must not be interpreted as successful-request throughput.

The HTTP/3 suite separately recorded connection-level failures. Its reported throughput reflects the observed impact of those failures rather than an artificially error-free result.

**Correction During Testing**

Initial testing revealed that nginx's default `keepalive_requests 1000` caused connections to close earlier than intended under high concurrency, affecting the measurements.

The nginx configurations were therefore updated to use:

```nginx
keepalive_requests 1000000;
```

The entire nginx benchmark set was rerun after this change. Results from the earlier configuration are not included on this page.

## 📊 Results

### 🔀 Reverse Proxy

This suite used four Node.js backends with round-robin request distribution and upstream connection reuse.

**Fixed-Concurrency Throughput**

The test generated 500,000 requests using 100 concurrent connections. All reported runs completed without errors.

Unit: requests per second (req/s).

| Server | req/s |
| --- | ---: |
| nginx 1.31.6 | 84,133 |
| Pingclair `main` | 78,348 |
| Pingclair `v0.2.2` | 77,545 |
| Traefik v3.7.14 | 30,315 |

nginx achieved the highest throughput in this workload.

Pingclair `main` reached approximately **93.1% of nginx's throughput**, representing an improvement of roughly **1.0%** over `v0.2.2`. Compared with Traefik, Pingclair `main` delivered approximately **2.58 times the throughput**.

These differences apply only to the tested backend implementation, connection configuration, and CPU limits. They should not be generalized to every reverse proxy workload.

**Concurrency Sweep**

The following table shows four representative points from the sweep.

Throughput is expressed in req/s, with request error rates shown in parentheses. Cells without an error rate indicate that all requests succeeded in that run.

| Connections | nginx | Pingclair `main` | Pingclair `v0.2.2` | Traefik |
| ---: | ---: | ---: | ---: | ---: |
| 101 | 69,201 | 71,227 | 70,603 | 30,028 |
| 1,001 | 22,182 (1.8%) | 26,958 | 31,411 | 10,272 |
| 5,001 | 6,364 (61%) | 5,908 (40%) | 9,010 | 2,906 (12%) |
| 9,901 | 2,189 (62%) | 1,606 (69%) | 4,880 | 325 (85%) |

At approximately 100 concurrent connections, nginx and both Pingclair versions delivered around 70,000 req/s, while Traefik reached approximately 30,000 req/s.

As concurrency increased, throughput declined across all implementations, with some experiencing substantial connection or request failure rates.

These results were affected by the two-CPU container limit, the VM's 8 GB memory allocation, and resource consumption on both the client and server sides. The decline cannot be attributed solely to server implementation.

Notably, **Pingclair `v0.2.2` was the only tested version to complete the 9,901-connection run without errors**.

In contrast, Pingclair `main` recorded error rates of 40% and 69% at 5,001 and 9,901 connections, respectively.

Although the development version showed slightly higher throughput at moderate concurrency, its behavior under extreme connection pressure was substantially less stable than that of `v0.2.2`.

**Follow-up Investigation: October 12, 2026**

To investigate this discrepancy, the 5,001- and 9,901-connection tests were repeated for both Pingclair versions, again using 20,000 requests per run.

| Connections | `main` Error Rate | `v0.2.2` Error Rate |
| ---: | ---: | ---: |
| 5,001 | 44% | 0% |
| 9,901 | 59% | 0% |

All failures observed with `main` occurred at the connection layer. No HTTP 5xx responses were recorded.

Pingclair `v0.2.2` successfully completed all 20,000 requests at both concurrency levels, without errors.

The follow-up measurements reproduced the same version-dependent behavior, indicating that the initial observation was not an isolated occurrence.

The underlying cause has not yet been established. Further investigation will focus on connection handling, resource limits, and changes introduced between the two versions.

### 📁 Static Files and Dynamic Zstd

This suite compared serving throughput across different file sizes and content encodings.

The 226 B and 10 KiB workloads each generated 500,000 requests per run, while the 2 MiB workload generated 5,000 requests per run.

Each result is the median of two runs. All reported runs completed without request failures.

Unit: req/s.

| File and Encoding | Pingclair `main` | Pingclair `v0.2.2` | nginx 1.31.6 | Caddy 2.11.7 |
| --- | ---: | ---: | ---: | ---: |
| 226 B (identity) | 181,429 | 177,053 | 35,046 | 18,057 |
| 10 KiB (identity) | 129,790 | 124,398 | 31,825 | 15,547 |
| 10 KiB + Zstd | 127,721 | 127,286 | 21,666 | 11,037 |
| 2 MiB (identity) | 1,441 | 1,459 | 1,102 | 635 |
| 2 MiB + Zstd | 1,884 | 2,201 | 437 | 280 |

Pingclair achieved the highest, or nearly the highest, throughput across all static file workloads in this suite.

For Pingclair `main` specifically:

- **226 B, identity encoding:** Approximately 5.18× nginx and 10.05× Caddy.
- **10 KiB, identity encoding:** Approximately 4.08× nginx and 8.35× Caddy.
- **10 KiB + Zstd:** Approximately 5.90× nginx and 11.57× Caddy.
- **2 MiB + Zstd:** Approximately 4.31× nginx and 6.73× Caddy.

Dynamic Zstd compression was among the workloads showing the largest performance differences in this benchmark.

However, the advantage was not constant across payload sizes. It varied with the file size, compression configuration, and amount of data ultimately transferred.

In the 2 MiB + Zstd test, Pingclair `v0.2.2` achieved 2,201 req/s, compared with 1,884 req/s for `main`, a difference of approximately 14.4% relative to `v0.2.2`.

This contrasts with the results for smaller files and warrants further investigation.

These measurements reflect complete HTTP response processing, including encoding, transfer, and server overhead. They do not measure Zstd compression speed in isolation.

Traefik was excluded from this suite because it does not provide a native static file server.

### 🧾 Access Logging Overhead (Telemetry Tax)

Access logs are essential for troubleshooting and traffic analysis, but formatting and writing log records also consume resources.

This suite measured throughput while serving a 226 B static file, comparing access logging disabled (A) with JSON access logging enabled (B).

Logs were written to a memory-backed tmpfs to minimize the influence of persistent storage I/O.

Results are medians of two runs, expressed in req/s.

| Server | A: No Logging | B: JSON Logging | Throughput Retained |
| --- | ---: | ---: | ---: |
| Pingclair `main` | 176,379 | 162,103 | 92% |
| Pingclair `v0.2.2` | 176,273 | 155,769 | 88% |
| nginx 1.31.6 | 37,256 | 35,095 | 94% |

Throughput retention is calculated as:

**Retention = Throughput with logging enabled / Throughput with logging disabled**

nginx incurred the lowest relative logging overhead in this workload, retaining approximately 94% of its baseline throughput.

Pingclair `main` retained approximately 91.9%, compared with 88.4% for `v0.2.2`, an improvement of roughly **3.5 percentage points**.

Expressed as throughput loss, logging overhead decreased from approximately 11.6% in `v0.2.2` to 8.1% in `main`.

This suggests that the development version handles JSON access logging more efficiently under the tested conditions.

In absolute terms, Pingclair `main` maintained 162,103 req/s with JSON logging enabled, approximately **4.62 times nginx's throughput** in the same test.

Because the logs were written to tmpfs, these results do not account for the additional costs of persistent disk writes, remote log collection, or log rotation under sustained load.

Caddy was not included in this suite.

### 🌐 HTTP/3 (Experimental)

This suite measured HTTP/3 throughput while serving a 226 B static file using short-lived QUIC connections.

Each run lasted 10 seconds.

Pingclair and Caddy were tested twice each. nginx exhibited greater run-to-run variation, so its sample count was increased to four runs.

The table reports the median throughput in req/s.

| Server | req/s |
| --- | ---: |
| Pingclair `main` | 2,338 |
| Pingclair `v0.2.2` | 2,322 |
| nginx 1.31.6 | 1,857 |
| Caddy 2.11.7 | 1,400 |

The two Pingclair versions delivered nearly identical HTTP/3 throughput, differing by less than 1%.

Under this workload, Pingclair `main` achieved approximately **1.26 times nginx's throughput** and **1.67 times Caddy's throughput**.

All completed HTTP requests succeeded.

nginx experienced a small number of connection-level failures in some runs, affecting up to approximately 2% of connections. Their effect on observed throughput is reflected in the reported results.

**Workload Characteristics**

The client opened a QUIC connection, completed one request, and then established a new connection for the next request.

Consequently, this benchmark primarily exercises the combined cost of QUIC connection establishment, TLS handshakes, connection teardown, and HTTP/3 request processing.

It does not represent sustained throughput over long-lived QUIC connections.

For the version of `tquic_client` used in this test, the `--total-requests-per-thread 0` option was essential.

Without it, the client terminated after completing its initial request rather than running for the intended measurement period. Setting the option to `0` allowed the `-d 10` parameter to govern the full 10-second test window.

HTTP/3 results remain experimental. Absolute throughput depends on the load generator, QUIC implementation, and UDP behavior within the OrbStack container network.

The ratios should therefore be interpreted only within the context of this environment and workload.

## 📐 Scope and Limitations

**Containerized and Virtualized Environment**

All measurements were conducted inside an OrbStack Linux VM running on a MacBook Pro with an Apple M2 processor and 16 GB of memory.

The results do not establish absolute performance on native Linux, FreeBSD, macOS, or other hardware platforms. They should not be treated as production capacity guarantees.

**CPU Limits and Concurrency Models**

Each server container was limited to two CPUs while retaining its implementation-specific default worker and thread configuration.

Differences in scheduling, concurrency models, and resource management mean that relative rankings may change on systems with different CPU limits or hardware characteristics.

**High-Concurrency Sweep**

Each sweep point consisted of only 20,000 requests and was measured once.

At several thousand concurrent connections, the number of requests was relatively small compared with the number of connections being established.

These results are therefore more useful for examining behavior under extreme connection pressure than for estimating long-term steady-state throughput.

Connection failures may also arise from limitations in the load generator, container network, or operating system. Error rates alone do not establish the root cause of server-side behavior.

**Compression Settings**

Each server used its own Zstd implementation and the compression settings documented above.

Because compression strategies and output sizes may differ, the Zstd results should be understood as comparisons of complete serving paths rather than rankings of compression algorithms performing identical computational work.

**HTTP/3 Workload**

The HTTP/3 suite used short-lived QUIC connections.

Its results do not describe every HTTP/3 usage pattern, particularly long-lived connections, extensive stream multiplexing, or traffic over real-world wide-area networks.

The benchmarks also did not evaluate performance under varying packet loss, network round-trip times, or bandwidth constraints.

**Excluded Comparisons**

Caddy was not included in the reverse proxy or access logging overhead suites.

Traefik does not provide native static file hosting and was therefore excluded from the static file tests. Its HTTP/3 performance was also not measured in this benchmark.

An omitted result should not be interpreted as an indication of performance.

**Version Snapshots**

This page records measurements collected on October 11–12, 2026, using the specified release versions and development commit.

Subsequent fixes or improvements do not retroactively change these results. Any conclusions about newer versions require fresh measurements.

## 🧾 Methodology and Sources

The Pingclair repository documents the general benchmarking methodology, validation rules, and supporting test tools. This page's measurement method — environment, candidate versions, container setup, and commands — is recorded in:

- [The local container matrix: this page's method](https://github.com/dorianverlaine/pingclair/blob/main/benchmarks/README.md#-the-local-container-matrix-orbstack-apple-silicon)
- [Benchmark methodology: general rules and validity checks](https://github.com/dorianverlaine/pingclair/blob/main/benchmarks/README.md)

All figures on this page are measurements obtained under the stated software versions, hardware configuration, and workloads.

Comparisons should be made only under equivalent test conditions. Results from different platforms, software versions, or workloads should not be combined without accounting for those differences.
