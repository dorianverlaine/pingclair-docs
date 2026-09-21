---
title: 아키텍처
h1_emoji: '🏗️'
description: 서버의 구성 요소와 요청이 지나는 경로.
---

## 🧱 구성 요소

Pingclair는 Cargo workspace입니다. 실제로 동작하는 서버는 `pingclair` 바이너리이며 다음 crate를 링크합니다.

| Crate | 역할 |
| --- | --- |
| `pingclair` | 명령줄 진입점. 인수 파싱, 로깅, 기동, 서비스 래퍼. |
| `pingclair-config` | 설정 컴파일러. Pingclairfile을 어휘 분석하고 파싱하며 의미를 검사합니다. |
| `pingclair-proxy` | Pingora 기반 HTTP/1.1·HTTP/2 프록시, quiche 기반 HTTP/3 리스너, 부하 분산, 공용 요청 정책 계층. |
| `pingclair-static` | 정적 파일 제공. 파일 읽기, MIME 타입, 범위 요청, 스트리밍. |
| `pingclair-tls` | 인증서 관리. 수동 인증서, 상주하는 내부 인증 기관, ACME 자동 발급. |
| `pingclair-api` | 상태 확인과 설정 다시 로드를 위한 Admin API. |
| `pingclair-core` | 위 crate들이 공유하는 데이터 구조와 서버 수명 주기. |

## 🚦 요청 경로

```text
client
  |
  |  TLS with ALPN, or QUIC
  v
listener             HTTP/1.1 and HTTP/2 on TCP, HTTP/3 on UDP
  |
  v
transport adapter    Pingora ProxyHttp for TCP, tokio-quiche for QUIC
  |
  v
policy layer         routing, matchers, headers, rate limits, access log
  |
  v
handler              file server | reverse proxy | FastCGI | static response
  |
  v
upstream or disk
```

두 전송 방식은 결국 같은 정책 계층으로 합류합니다. 그래서 라우팅, 헤더 처리, 속도 제한, 접근 로그의 동작이 HTTP/1.1, HTTP/2, HTTP/3에서 같습니다. 차이는 프로토콜상 꼭 필요한 지점에서만 납니다.

## 🌊 요청 처리 특성

- **본문은 스트리밍됩니다.** 요청과 응답 본문은 상한이 있는 청크로 프록시를 지납니다. 압축, 미들웨어, 프록시는 본문 전체를 버퍼링하지 않으므로 큰 업로드나 느린 수신자가 본문 크기에 비례하는 메모리를 쓰지 않습니다.
- **업스트림 연결은 재사용됩니다.** 백엔드와의 keepalive 연결을 재사용합니다. 호스트 이름 업스트림은 `dns_refresh`로 설정한 간격마다 다시 해석되므로, 새 주소로 재시작한 컨테이너에도 사람이 개입하지 않고 따라갑니다.
- **런타임 상태는 요청 중에 불변입니다.** 요청은 공개된 스냅샷을 읽습니다. 다시 로드는 사용 중인 것을 수정하는 대신 새 스냅샷을 공개합니다.

## 🌐 프로토콜별 차이

일부 동작은 프로토콜에 따라 의도적으로 다릅니다. 나중에 발견하는 대신 여기에 적어 둡니다.

| 영역 | 동작 |
| --- | --- |
| Trailers | 요청에서 선언한 trailer는 전달되지 않습니다. 응답 확정 전에는 `501`을 반환하고, 확정된 HTTP/3 스트림은 reset하며, 업스트림이 응답 trailer를 알리면 `502`를 반환합니다. |
| CONNECT | HTTP/3에서 터널 지원이 구현될 때까지 `CONNECT`와 extended `CONNECT`는 `501`을 반환합니다. |
| FastCGI | `php_fastcgi`는 HTTP/1.1과 HTTP/2에서 동작합니다. FastCGI가 필요한 라우트는 그 경로가 자체 FastCGI 클라이언트를 가질 때까지 HTTP/3에서 `501`을 반환합니다. |

## ⚠️ 알려진 결함

WebSocket 업그레이드는 부하가 걸리면 간헐적으로 실패합니다. 바쁜 머신에서 약 10-15%가 실패합니다. 원인은 Pingclair 자체의 업그레이드 처리 가 아니라 업스트림 `pingora-proxy` crate의 경쟁 상태입니다. 유휴 상태의 개발 머신에서는 재현되지 않으므로 여기에 적어 둡니다. 업스트림 이슈: [cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946).
