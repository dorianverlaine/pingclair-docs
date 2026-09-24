---
title: 'TLS에서 조정할 수 있는 것'
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair가 따르는 TLS·프로토콜 설정과 이름을 밝혀 거부하는 설정, 그리고 클라이언트 인증서를 요구하거나 호스트 간에 인증서 저장소를 옮기는 방법을 설명합니다.
---

Pingclair의 TLS 설정은 의도적으로 적습니다. 이름에는 인증서가 자동으로 붙으며, 이
페이지의 설정은 그 방식을 정합니다. Caddy가 받아들이는 그 밖의 TLS 설정은 무시하지
않고 이름을 밝혀 거부하므로, 설정이 적힌 것보다 조용히 덜 하는 일은 없습니다. 아래의
모든 결과는 실제 호스트에서 측정했습니다.

📌 이 페이지는 최신 공개 릴리스인 **v0.2.0-rc.3**을 설명합니다. 서버의 `main`
브랜치에만 있는 변경은 **다음 릴리스**로 표시합니다.

## 🧾 시작하기 전에

- Pingclair가 설치되어 실행 중이어야 합니다([설치](/ko/start/install/)).
- 인증 기관 관련 부분에는 호스트로 해석되는 이름이 필요하며, 실험용 머신이라면 내부
  인증 기관을 씁니다([HTTPS](/ko/start/https/)).

## 🌐 어떤 프로토콜을 서비스하는가

프로토콜 집합은 전역 `servers` 블록에 둡니다.

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

`sudo ss -lun | grep ':443 '`로 측정한 결과입니다.

| 설정 | UDP 443 리스너 |
| --- | --- |
| `protocols h1 h2` | 0개 — HTTP/3 없음 |
| `protocols h1 h2 h3` | 1개 — HTTP/3 활성화 |

⚠️ 이 목록이 정하는 것은 **HTTP/3**뿐입니다. `h1`만 적어도 HTTP/2는 꺼지지
않습니다. `protocols h1`에서도 `h2`를 제시한 클라이언트는 HTTP/2로 협상했습니다.
서버가 목록에서 읽는 것은 `h3`가 들어 있는지뿐이므로, HTTP/2를 끄는 설정은 없습니다.
`protocols` 줄이 없으면 HTTP/3는 켜집니다.

사이트별로 `http3 off`는 QUIC 리스너가 다른 사이트를 계속 서비스하는 동안 한 이름만
HTTP/3에서 빼도록 의도된 옵션입니다.

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

⚠️ v0.2.0-rc.3에서 이 옵션은 받아들여지지만 아무 효과가 없습니다. **다음 릴리스**:
효과가 생기며, 해당 사이트는 더 이상 `Alt-Svc`로 HTTP/3를 알리지 않습니다.

## 🏛️ 인증서 출처

출처는 세 가지이며, 모두 [HTTPS 페이지](/ko/start/https/)에 나옵니다.

| 출처 | 설정 | 용도 |
| --- | --- | --- |
| Let's Encrypt | 공개 이름만 적기 | 공개 이름. 백그라운드에서 갱신합니다. |
| 내부 인증 기관 | `tls internal` | 실험용 이름, 비공개 오리진, 터널. |
| 직접 준비한 파일 | `tls { cert … key … }` | 다른 곳에서 발급한 인증서. |

갱신은 백그라운드에서 실행됩니다. 전역 `renewal_window_ratio` 옵션은 각 인증서
유효기간에 대한 비율로 갱신을 얼마나 일찍 시작할지 정합니다.

## 🔐 클라이언트 인증서

`client_auth`는 서버가 클라이언트에게 인증서를 요구하게 합니다. `openssl`로 작은
인증 기관과 클라이언트 인증서를 만든 뒤, 사이트가 그 인증 기관의 인증서 **파일**을
가리키게 합니다.

```caddyfile
https://internal.test {
    tls {
        internal
        client_auth {
            mode require_and_verify
            trusted_ca_cert_file /etc/pingclair/client-ca.crt
        }
    }
    file_server /srv/site
}
```

측정 결과, 클라이언트 인증서가 없는 요청은 핸드셰이크에 실패하고,
`--cert client.crt --key client.key`를 붙인 같은 요청은 `200`으로 응답합니다.

모드는 `request`, `require`, `verify_if_given`, `require_and_verify`입니다. 철자가
틀린 모드는 전체 목록
`(expected request, require, verify_if_given or require_and_verify)`와 함께
거부됩니다.

⚠️ `trusted_ca_cert`는 한 줄로 base64 인코딩한 인증서 자체를 받고,
`trusted_ca_cert_file`은 경로를 받습니다. 앞의 것에 경로를 주면 컴파일은 되지만
시작할 때 `trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45`로
실패합니다. 45는 `-----BEGIN`의 `-`입니다. 파일은 `pingclair` 사용자가 읽을 수 있어야
합니다.

## 📦 인증서 저장소 옮기기

저장소에는 발급된 인증서, ACME 계정, 내부 인증 기관이 들어 있습니다. 패키지로
설치했다면 서비스 계정 홈 아래의 데이터 디렉터리인
`/var/lib/pingclair/.local/share/pingclair`입니다. 다른 사용자로 실행한 명령은 그
사용자의 데이터 디렉터리를 찾으므로 예시에서는 `PINGCLAIR_TLS_STORE`를 지정합니다.
지정하지 않으면 root는 `/root/.local/share/pingclair`를 씁니다. 저장소는
`storage-export`와 `storage-import`로 옮깁니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/.local/share/pingclair
sudo mkdir -p /var/lib/pingclair/.local/share/pingclair && sudo chown pingclair:pingclair /var/lib/pingclair/.local/share/pingclair
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/.local/share/pingclair
```

실행에서 알게 된 세 가지가 있습니다. 아카이브는 이름과 관계없이 **일반 tar**이고
권한 `600`으로 기록되므로 다시 읽으려면 root가 필요합니다. 가져오기는 아카이브에
기록된 소유권을 복원합니다. 그리고 저장소에는 Admin API가 마지막으로 적용한 설정인
`autosave.json`이 들어 있으므로, 가져오기는 그것도 복원합니다.

**다음 릴리스**: 내부 인증 기관은 Caddy와 같은 방식으로 `pki/authorities/local/`
아래에 보관됩니다. 기존 `internal/` 디렉터리는 마이그레이션되지 않습니다. 서버가 새
인증 기관을 만들며, 모든 클라이언트가 새 루트를 다시 신뢰해야
합니다(`pingclair trust`). 또한 전역 `storage file_system <path>` 옵션으로 설정 안에서
저장소를 지정할 수 있습니다.

그 뒤 서비스가 `Internal CA I/O error: Permission denied`로 시작을 거부하면 서비스
계정이 저장소 파일에 쓸 수 없는 것입니다.
`sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair`로
고치면 사이트가 다시 응답합니다.

## 🚫 조정할 수 없는 것

Pingclair는 다음 Caddy 설정을 인식하고 거부하므로, 이 중 하나가 조용히 빠진 채 파일이
실행되는 일은 없습니다.

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

따라서 암호 스위트, 곡선, ALPN 목록, 온디맨드 발급은 설정이 아니라 빌드가 정합니다.
OCSP 스테이플링도 수행하지 않습니다. 이 중 필요한 것이 있다면 설정 실수가 아니라 기능
요청 사항입니다.

## ⚠️ 잘 되지 않을 때

- **`client_auth`가 `not valid base64`로 시작을 거부합니다.** `trusted_ca_cert`에
  경로를 주었습니다. 파일을 받는 표기는 `trusted_ca_cert_file`입니다.
- **유효한 인증서를 가진 클라이언트가 거부됩니다.** 그 인증서에 서명한 CA가
  `trusted_ca_cert_file`의 CA인지, 인증서가 만료되지 않았는지 확인합니다.
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand`가 파일을 거부합니다.**
  구현되어 있지 않습니다. 위 절을 참고합니다.
- **`protocols h1 h2` 후에도 HTTP/3가 동작합니다.** 목록이 HTTP/3를 제어하므로 그래서는
  안 됩니다. UDP 443이 여전히 수신 중이라면 실행 중인 파일이 수정한 파일이 아닙니다
  ([리로드의 의미](/ko/start/service/#-리로드의-의미)).
- **저장소를 옮긴 뒤 서비스가 시작되지 않습니다.** 위와 같이 소유권 문제입니다.

## 🧭 다음 단계

- [HTTPS](/ko/start/https/): 인증서를 얻는 네 가지 방법과 각각의 정확한 로그
  줄입니다.
- [HTTP/3](/ko/guides/http3/): 켜는 방법과 클라이언트가 사용했는지 증명하는
  방법입니다.
- [`tls`](/ko/reference/directives/#tls): 디렉티브 레퍼런스입니다.
