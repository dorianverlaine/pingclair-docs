---
title: 프로젝트 상태
h1_emoji: '📌'
description: 현재 릴리스가 지원하는 것, 거부하는 것, 알려진 결함.
---

## 📌 릴리스

현재 릴리스는 **v0.2.0-rc.3**이며 릴리스 후보입니다. 변경 내용과 태그 시점에 알려진 결함은 [릴리스 노트](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)에 있습니다.

`v0.1.x` 계열은 유지보수되지 않습니다. 수정도, 백포트도, 보안 공지도 없습니다. 또한 `v0.1.x`는 Admin API의 `api_key` 필드를 파싱하면서 읽지 않아 그 필드가 아무것도 보호하지 않았습니다.

## ✅ 지원 항목

| 영역 | 상태 |
| --- | --- |
| 프로토콜 | TCP 위의 HTTP/1.1과 HTTP/2, QUIC 위의 HTTP/3을 하나의 설정에서. |
| TLS | ACME 공개 인증서 자동 발급, 상주하는 내부 인증 기관, 수동 인증서와 키. |
| 정적 파일 | `zstd`·`gzip` 압축, 범위 요청, 조건부 요청을 지원하는 파일 제공. |
| 리버스 프록시 | 여러 업스트림, 여러 부하 분산 정책, 능동 상태 확인, 예비 업스트림. |
| FastCGI | HTTP/1.1과 HTTP/2에서 `php_fastcgi` 지원. |
| 속도 제한 | 매처 단위의 정확한 로컬 속도 제한. |
| 관측성 | 로테이션을 지원하는 접근 로그와 Prometheus 지표. |
| 관리 | 상태 확인과 설정 다시 로드를 위한 Admin API. |

## 🛡️ 의도적으로 거부하는 설정

설정 형식이 정의한 이름은 서버가 구현한 수보다 많습니다. 충족할 수 없는 이름은 로드 시점에 이름을 들어 거부하고 "기능이 없다"고 알립니다. 자주 묻는 예:

- `map`, `invoke`, `tracing` 같은 지시어
- `storage` 옵션(인증서와 상태는 로컬 디스크에만 저장하기 때문)
- `on_demand_tls`와 OCSP stapling 관련 옵션
- `handle_errors`(설정 타입은 있지만 아무 일도 하지 않음)
- `encode br`(스트리밍 Brotli 인코더가 없기 때문)

전체 목록은 서버 저장소의 README에 있으며, 파서가 목록에 없는 이름을 거부하면 실패하는 테스트가 지킵니다.

## ⚠️ 알려진 제한

- **인증서 저장소는 로컬 전용.** 저장소가 디스크의 디렉터리이므로 여러 인스턴스가 하나를 공유할 수 없습니다.
- **DNS-01 공급자는 하나.** `tls { dns cloudflare <token> }`와 전역 `acme_dns`는 Cloudflare만 구현합니다. 다른 공급자 이름은 기동 시 거부되며 받아들여 무시되지 않습니다.
- **HTTP/3의 trailer와 터널.** 요청에서 선언한 trailer는 전달되지 않습니다(확정 전 `501`, 확정 후 스트림 reset). 업스트림 trailer는 `502`가 되고 `CONNECT`는 `501`을 반환합니다.
- **HTTP/3의 FastCGI는 `501`을 반환합니다.** 그 경로가 자체 FastCGI 클라이언트를 가질 때까지의 동작입니다.
- **WebSocket 업그레이드는 부하 시 간헐적으로 실패합니다.** 바쁜 머신에서 약 10-15%입니다. 원인은 Pingclair의 처리 가 아니라 업스트림 `pingora-proxy` crate의 경쟁 상태입니다([cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)). 유휴 머신에서는 재현되지 않습니다.

## 🐛 보고

결함과 문서 오류는 [issue tracker](https://github.com/dorianverlaine/pingclair/issues)로 보고하십시오. 비공개 보고 경로를 정한 보안 정책은 아직 공개하지 않았습니다.

## 📚 관련 문서

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md): 릴리스 간 변경.
- [성능 측정](/ko/project/benchmarks/): 측정 조건과 결과.
- [아키텍처](/ko/concepts/architecture/): 구성 요소와 요청 경로.
