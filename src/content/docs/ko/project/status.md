---
title: 프로젝트 상태
h1_emoji: '📌'
description: 현재 릴리스가 지원하는 것, 설계상 거부하는 것, 알려진 제약과 결함, 그리고 다음 릴리스에서 바뀌는 것을 정리합니다.
---

이 페이지는 배포하기 전에 한 가지 질문에 답합니다. 현재 릴리스가 필요한 일을 하는지,
그리고 어디까지 하는지입니다. 기준은 최신 공개 릴리스인 **v0.2.0-rc.3**입니다.

## 📌 현재 릴리스는 릴리스 후보입니다

현재 릴리스는 **v0.2.0-rc.3**입니다.
[릴리스 노트](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)에
바뀐 점과 태그 시점에 알려진 결함이 정리되어 있습니다.

`v0.1.x` 계열은 더 이상 유지보수되지 않습니다. 수정, 백포트, 보안 권고 모두
제공되지 않습니다. 업그레이드하십시오. `v0.1.x`는 Admin API의 `api_key` 필드를
파싱만 하고 읽지 않았으므로, 그 Admin API는 아무도 인증하지 않았습니다.

## ✅ 릴리스가 지원하는 것

| 영역 | 지원 내용 |
| --- | --- |
| 프로토콜 | 하나의 설정으로 TCP 위의 HTTP/1.1과 HTTP/2, QUIC 위의 HTTP/3를 제공합니다. |
| TLS | ACME를 통한 자동 공개 인증서, 영속적인 내부 인증 기관, 직접 준비한 인증서 파일을 지원합니다. |
| 정적 파일 | `zstd`·`gzip` 압축, 범위 요청, 조건부 요청을 갖춘 파일 서비스입니다. |
| 리버스 프록시 | 여러 업스트림, 여러 로드 밸런싱 정책, 능동 헬스 체크, 백업 업스트림을 지원합니다. |
| FastCGI | HTTP/1.1과 HTTP/2에서의 `php_fastcgi`입니다. |
| 속도 제한 | 매처별로 정확한 로컬 속도 제한입니다. |
| 관측성 | 로테이션을 지원하는 액세스 로그와 Prometheus 메트릭입니다. |
| 관리 | 상태를 조회하고 설정을 리로드하는 Admin API입니다. |

## 🛡️ 서버가 설계상 거부하는 이름

Caddyfile 형식은 Pingclair가 구현한 것보다 많은 이름을 정의합니다. 서버가 따를 수
없는 이름은 파일을 로드할 때 빠진 기능을 밝히는 메시지와 함께 거부되며, 그런 이름이
든 설정은 시작되지 않습니다. 가장 자주 묻는 이름은 다음과 같습니다.

- `map`, `invoke`, `tracing` 디렉티브
- `storage` 옵션. 인증서와 상태는 로컬 디스크에만 둡니다.
- `on_demand_tls`와 `ocsp_stapling` 옵션
- `handle_errors`. 사용자 정의 오류 페이지는 대신 `error_page`로 만듭니다.
- `encode br`. 스트리밍 Brotli 인코더가 없습니다.

전체 목록은 서버 저장소의 README에 있습니다. 파서가 README에 없는 이름을 거부하면
그곳의 테스트가 실패하므로, 목록이 코드보다 뒤처질 수 없습니다.

## ⚠️ 알려진 제약

- **인증서 저장소는 로컬입니다.** 저장소가 디스크의 디렉터리이므로 여러 인스턴스가
  인증서 저장소 하나를 공유할 수 없습니다.
- **이 릴리스에서는 DNS-01이 완료되지 않습니다.** Cloudflare에 대해서는
  `tls { dns cloudflare <token> }`과 전역 `acme_dns` 옵션을 받아들이며, 다른
  프로바이더는 이름을 밝혀 거부합니다. 하지만 v0.2.0-rc.3에서는 TXT 레코드에 잘못된
  값이 들어가므로 모든 DNS-01 주문이 `Invalid`로 끝납니다. 수정 사항은 `main`에
  있습니다([HTTPS](/ko/start/https/#-dns-01과-와일드카드)).
- **HTTP/3에는 트레일러와 터널이 없습니다.** 선언된 요청 트레일러는 모든
  프로토콜에서 거부되며, HTTP/3는 `CONNECT`를 리셋합니다
  ([아키텍처](/ko/concepts/architecture/#-프로토콜이-달라지는-곳)).
- **부하가 걸리면 WebSocket 업그레이드가 간헐적으로 실패합니다.** 바쁜 머신에서
  약 10~15%입니다. 원인은 업스트림 `pingora-proxy` 크레이트의 경쟁 조건이며
  ([cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)),
  한가한 머신에서는 거의 재현되지 않습니다.

## 🔁 다음 릴리스에서 바뀌는 것

아래 변경은 `main`에 있으며 v0.2.0-rc.3에는 없습니다. 몇 가지는 업그레이드할 때
동작을 바꿉니다.
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)의
Unreleased 항목에 업그레이드 노트와 함께 모두 기록되어 있습니다.

- **라우트 순서가 Caddy를 따릅니다.** 가장 구체적인 경로가 아니라 디렉티브 순서가
  어떤 라우트가 응답할지 정합니다
  ([설정 모델](/ko/concepts/configuration/#-어떤-라우트가-요청에-응답하는가)).
- **`encode`가 요구한 곳에서만 압축합니다.** `encode`가 없는 사이트는 파일을 압축하지
  않고 제공합니다.
- **기본 요청 본문 한도가 없어집니다.** 1 MiB 기본값이 사라집니다. 이에 의존했다면
  `request_body { max_size … }`를 설정합니다.
- **`remote_ip`와 `client_ip`가 달라집니다.** `remote_ip`는 연결의 피어와, `client_ip`는
  `trusted_proxies`를 적용한 뒤의 클라이언트와 일치합니다. Pingclairfile에서
  클라이언트를 차단하려면 `client_ip`로 일치시키고 `abort`합니다. `blocked_ips`는 JSON
  설정에만 있습니다.
- **`CONNECT`와 `TRACE`는 모든 프로토콜에서** `Allow` 헤더와 함께 **`405`를
  받습니다.**
- **HSTS가 연결을 따릅니다.** `Strict-Transport-Security`는 암호화된 응답에만 보내며,
  Pingclairfile에서는 `header Strict-Transport-Security "max-age=…"`로 켭니다.
- **중지가 정상 종료가 됩니다.** `SIGTERM`은 처리 중인 요청이
  `grace_period`(기본값 30초) 안에 끝나도록 기다립니다.
- **admin이나 HTTP/3 포트가 이미 쓰이고 있으면** 로그만 남기지 않고 **시작을
  멈춥니다.**
- **게이트웨이 오류가 누가 만들었는지 밝힙니다.** Pingclair가 만든 `502`나 `504`에는
  `Proxy-Status` 헤더가 붙습니다.
- **DNS-01이 동작하며**, 와일드카드 사이트는 와일드카드 인증서 하나를 주문합니다.
- **`storage file_system <path>`와 `ocsp_stapling off`를 받아들입니다.**
- **내부 인증 기관이 Caddy의 구성으로 옮겨집니다.** 기존 인증 기관은
  마이그레이션되지 않습니다. 새 루트가 만들어지며, 클라이언트가 이를 다시 신뢰해야
  합니다.

## 🐛 결함 보고

결함과 문서 오류는
[이슈 트래커](https://github.com/dorianverlaine/pingclair/issues)에 보고합니다.
비공개 보고 채널을 갖춘 보안 정책은 아직 게시되지 않았습니다.

## 📚 관련 페이지

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md):
  릴리스 간에 바뀐 것입니다.
- [벤치마크](/ko/project/benchmarks/): 측정 조건과 결과입니다.
- [아키텍처](/ko/concepts/architecture/): 구성 요소와 요청 경로입니다.
