---
title: 아키텍처
h1_emoji: '🏗️'
description: 서버를 이루는 크레이트, 요청이 그 사이를 지나가는 경로, 그리고 HTTP/1.1, HTTP/2, HTTP/3의 동작이 달라지는 곳을 설명합니다.
---

세 가지 HTTP 버전을 말하는 웹 서버가 잘못되는 길은 두 가지입니다. 프로토콜마다
규칙의 사본을 따로 키우거나, 한 프로토콜만 다른 프로토콜이 따르는 규칙을 조용히
빠뜨리는 것입니다. Pingclair는 각 트랜스포트에는 바이트를 옮기는 일만 맡기고, 모든
요청을 하나의 공유 정책 계층으로 보내 두 문제를 모두 피합니다. 이 페이지는 구성
요소, 요청이 지나가는 경로, 그리고 프로토콜 간 차이가 아직 남아 있는 몇 곳을
설명합니다. 기준 릴리스는 **v0.2.0-rc.3**입니다.

## 🧱 서버는 몇 개의 크레이트로 만든 단일 바이너리입니다

Pingclair는 Cargo 워크스페이스입니다. `pingclair` 바이너리는 아래 크레이트를
링크하며, 각 크레이트는 하나의 책임만 집니다.

| 크레이트 | 책임 |
| --- | --- |
| `pingclair` | 명령줄 진입점입니다. 인자 파싱, 로깅, 시작, 종료, 리로드를 맡습니다. |
| `pingclair-config` | 설정 컴파일러입니다. Pingclairfile을 읽고 검사해 서버가 실행할 설정을 만듭니다. |
| `pingclair-proxy` | Pingora 기반 HTTP/1.1·HTTP/2, quiche 기반 HTTP/3, 로드 밸런싱, 그리고 공유 요청 정책 계층입니다. |
| `pingclair-static` | 정적 파일 서비스입니다. 파일 읽기, MIME 타입, 범위 요청과 조건부 요청, 스트리밍을 맡습니다. |
| `pingclair-fastcgi` | `php_fastcgi`가 PHP-FPM에 접속할 때 쓰는 FastCGI 클라이언트입니다. |
| `pingclair-tls` | 인증서 관리입니다. 인증서 파일, 내부 인증 기관, ACME 발급을 맡습니다. |
| `pingclair-api` | 상태를 조회하고 설정을 리로드하는 Admin API입니다. |
| `pingclair-core` | 위 크레이트들이 공유하는 데이터 구조와 생명주기입니다. |

## 🚦 모든 요청은 같은 정책 계층을 지나갑니다

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

트랜스포트 어댑터는 프로토콜 프레임을 요청으로 바꿔 다음 단계로 넘깁니다. 라우팅,
헤더 규칙, 속도 제한, 액세스 로그는 정책 계층에 한 번만 존재하므로 HTTP/1.1,
HTTP/2, HTTP/3에서 똑같이 동작합니다. 두 트랜스포트는 업스트림에도 같은 커넥터로
접속하므로 연결 풀링, 업스트림 TLS, 타임아웃도 공유됩니다.

## 🌊 모든 요청에 성립하는 것

- **본문은 스트리밍됩니다.** 요청과 응답 본문은 크기가 제한된 조각 단위로 서버를
  지나갑니다. 압축과 프록시가 본문 전체를 먼저 모으지 않으므로, 큰 업로드나 느린
  클라이언트가 본문 크기에 비례하는 메모리를 쓰게 만들지 않습니다.
- **업스트림 연결은 재사용됩니다.** 백엔드로의 keepalive 연결은 풀로 관리됩니다.
  호스트 이름으로 지정한 업스트림은 `dns_refresh`에서 정한 간격마다 다시 해석되므로,
  새 주소로 재시작한 백엔드 컨테이너도 운영자의 개입 없이 따라갑니다.
- **요청이 처리되는 동안 설정은 읽기만 하고 바꾸지 않습니다.** 각 요청은 컴파일된
  설정의 게시된 스냅숏을 읽습니다. 리로드는 새 스냅숏을 만들어 교체하며, 이미 처리
  중인 요청은 이전 스냅숏으로 끝납니다.

## 🌐 프로토콜이 달라지는 곳

몇 가지 동작은 프로토콜에 따라 다릅니다. 운영 중에 처음 알게 되는 일이 없도록 여기에
정리합니다.

| 영역 | v0.2.0-rc.3의 동작 |
| --- | --- |
| 트레일러 | 요청 트레일러는 어떤 프로토콜에서도 전달하지 않습니다. 트레일러를 선언한 요청은 응답이 시작되기 전에 `501`로 응답합니다. 응답이 이미 시작된 HTTP/3 스트림은 대신 리셋합니다. 트레일러를 알리는 업스트림 응답은 `502`로 응답합니다. |
| `CONNECT` | Pingclair는 터널을 열지 않습니다. HTTP/1.1과 HTTP/2는 `405`로 응답합니다. HTTP/3는 표준 `CONNECT` 요청을 잘못된 요청으로 보고 리셋하며, `:scheme`과 `:path`를 함께 가진 요청에는 `501`로 응답합니다. |
| FastCGI | `php_fastcgi`는 HTTP/1.1과 HTTP/2에서 동작합니다. HTTP/3에서는 FastCGI가 필요한 라우트가 `501`로 응답합니다. |

📌 **다음 릴리스**. `main`에서는 모든 프로토콜에서 `CONNECT`에 `Allow` 헤더와 함께
`405`로 응답하며, `TRACE`도 같은 방식으로 응답합니다. 이 변경은 v0.2.0-rc.3에 없으며,
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)의
Unreleased 항목에 기록되어 있습니다.

## ⚠️ 부하가 걸리면 WebSocket 업그레이드가 간헐적으로 실패합니다

Pingclair는 WebSocket을 프록시하지만, 머신이 바쁠 때는 업그레이드의 약 10~15%가
실패합니다. 밖에서 보면 실패한 업그레이드는 `101 Switching Protocols` 응답 직후에
바로 닫히는 연결입니다. 원인은 Pingclair의 업그레이드 처리가 아니라 업스트림
`pingora-proxy` 크레이트의 경쟁 조건이며, 설정으로 피할 방법은 없습니다. 한가한 개발
머신에서는 거의 재현되지 않기 때문에 여기에 명시합니다. 업스트림 이슈:
[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946).

## 🧭 관련 페이지

- [설정 모델](/ko/concepts/configuration/): Pingclairfile이 위에서 설명한 스냅숏이
  되는 과정입니다.
- [프로젝트 상태](/ko/project/status/): 릴리스가 지원하는 것과 거부하는 것입니다.
