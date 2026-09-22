---
title: TLS에서 조정할 수 있는 것
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair가 존중하는 TLS와 프로토콜 설정, 이름을 대며 거부하는 설정, 클라이언트 인증서 요구 방법, 인증서 저장소 옮기기를 정리합니다.
---

Pingclair의 TLS 표면은 의도적으로 작습니다. 이름은 자동으로 인증서를 받고, 그 방식
을 결정하는 설정이 여기 적힌 것들입니다. Caddy가 받아들이는 나머지는 조용히
무시되지 않고 이름을 대며 거부되므로, 설정이 이름보다 조용히 적게 하지는 않습니다.
이 페이지는 실제 호스트에서 측정한 "실제로 되는 것"과 "안 되는 것"을 모은 것입니다.

## 🧾 시작하기 전에

- Pingclair가 설치되어 실행 중이어야 합니다([설치](/ko/start/install/)).
- 인증 기관과 관련된 부분에서는 호스트로 해석되는 이름, 또는 실험용 내부 인증 기관
  ([HTTPS](/ko/start/https/)).

## 🌐 어떤 프로토콜을 서비스하는가

프로토콜 집합은 전역 `servers` 블록에 있습니다.

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

`sudo ss -lun | grep ':443 '`로 측정:

| 설정 | UDP 443 리스너 |
| --- | --- |
| `protocols h1 h2` | 0 — HTTP/3 없음 |
| `protocols h1 h2 h3` | 1 — HTTP/3 켜짐 |

⚠️ 이 목록이 결정하는 것은 **HTTP/3**뿐입니다. `h1`만 적어도 HTTP/2는 빠지지
않습니다. `protocols h1`에서도 ALPN으로 `h2`를 제시한 클라이언트는 HTTP/2를
협상했습니다. 컴파일러는 이 목록을 HTTP/3 스위치에 대응시킬 뿐입니다
(`config.global.http3 = protocols.contains(H3)`). 이름별로 HTTP/2를 끄는 설정은
없습니다.

사이트 단위에서는 `http3 off`가 QUIC 리스너를 멈추지 않고 그 이름을 HTTP/3에서
빼냅니다.

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

## 🏛️ 인증서 출처

세 가지이며 모두 [HTTPS 페이지](/ko/start/https/)에 있습니다.

| 출처 | 설정 | 용도 |
| --- | --- | --- |
| Let's Encrypt | 공개 이름 그대로 | 공개 이름. 백그라운드에서 갱신. |
| 내부 인증 기관 | `tls internal` | 실험용 이름, 사설 오리진, 터널. |
| 직접 만든 파일 | `tls { cert … key … }` | 다른 곳에서 발급한 인증서. |

갱신은 스스로 돌아갑니다. 전역 옵션의 `renewal_window_ratio`는 각 인증서 수명의
얼마나 일찍 갱신을 시작할지를 비율로 정합니다.

## 🔐 클라이언트 인증서

`client_auth`는 클라이언트 인증서를 요구합니다. `openssl`로 작은 인증 기관과
클라이언트 인증서를 만들고, 사이트를 인증 기관 **파일**로 향하게 합니다.

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

측정: 클라이언트 인증서 없는 요청은 핸드셰이크에서 실패하고,
`--cert client.crt --key client.key`를 붙인 같은 요청은 `200`을 답합니다.

모드는 `request`, `require`, `verify_if_given`, `require_and_verify`이며 대체가
없습니다. 철자를 틀리면
`(expected request, require, verify_if_given or require_and_verify)`라는 목록과
함께 거부됩니다.

⚠️ `trusted_ca_cert`는 인증서를 **인라인**으로 받고, `trusted_ca_cert_file`은
경로를 받습니다. 전자에 경로를 주면 컴파일은 되고 시작할 때
`trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45`로
실패합니다(`-----BEGIN`의 `-`). 파일은 `pingclair` 사용자가 읽을 수 있어야 합니다.

## 📦 인증서 저장소 옮기기

저장소에는 발급된 인증서, ACME 계정, 내부 인증 기관이 들어 있고,
그 자리는 `/var/lib/pingclair/.local/share/pingclair`——서비스 계정의 데이터
디렉터리입니다. 다른 사용자로 돌릴 때 `PINGCLAIR_TLS_STORE`가 그것을
가리킵니다(아래 예시가 접두사를 붙이는 이유이고, root의 기본값은
`/root/.local/share/pingclair`입니다). `storage-export`와 `storage-import`가 그것을 옮깁니다.

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

실행에서 나온 세 가지. 아카이브는 이름과 무관하게 **그냥 tar**이고 모드 `600`으로
쓰이므로 다시 읽으려면 root가 필요합니다. 가져오기는 아카이브에 기록된 소유권을
그대로 복원합니다. 그리고 저장소에는 `autosave.json`(Admin API가 마지막으로 적용한
설정)도 들어 있어 함께 돌아옵니다.

그 뒤 서비스가 `Internal CA I/O error: Permission denied`로 시작을 거부하면 저장소
파일을 서비스 계정이 쓸 수 없는 것입니다.
`sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair`로 고쳐지고 사이트가
다시 응답합니다.

## 🚫 조정할 수 없는 것

다음은 Pingclair가 인식하고 거부하는 Caddy 설정입니다. 설정이 조용히 빠진 채
실행되는 일은 없습니다.

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

즉 암호 스위트, 곡선, ALPN 목록, 온디맨드 발급은 설정이 아니라 빌드의 선택입니다.
OCSP 스테이플링과 `preferred_chains`도 구현되어 있지 않습니다. 이 중 하나가
필요하다면 설정 실수가 아니라 기능 요청입니다.

## ⚠️ 잘 되지 않을 때

- **`client_auth`가 `not valid base64`로 시작을 거부.** `trusted_ca_cert`에 경로를
  주었습니다. 파일용 철자는 `trusted_ca_cert_file`입니다.
- **유효한 인증서를 가진 클라이언트가 거부됨.** 서명한 인증 기관이
  `trusted_ca_cert_file`의 그것인지, 인증서가 만료되지 않았는지 확인하십시오.
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand`가 파일을 거부.**
  구현되어 있지 않습니다. 위 절을 보십시오.
- **`protocols h1 h2`인데 HTTP/3가 계속 동작.** 그래서는 안 됩니다. 그것을 정하는
  것이 이 목록입니다. UDP 443이 아직 듣고 있다면 실행 중인 파일이 편집한 파일이
  아닙니다([재적용의 의미](/ko/start/service/#-재적용의-의미)).
- **저장소를 옮긴 뒤 서비스가 시작하지 않음.** 위의 소유권 문제입니다.

## 🧭 다음 단계

- [HTTPS](/ko/start/https/): 인증서를 얻는 네 가지 방법과 그대로의 로그 줄.
- [HTTP/3](/ko/guides/http3/): 켜고, 클라이언트가 실제로 썼음을 증명하는 방법.
- [`tls`](/ko/reference/directives/#tls): 지시어 레퍼런스.
