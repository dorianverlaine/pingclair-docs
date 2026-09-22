---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: 공개 이름의 인증서를 받고, 내부 인증서를 배포하거나 직접 만든 인증서를 쓰고, 서버가 실제로 무엇을 제공하는지 확인합니다.
---

사이트 블록의 주소가 공개 이름이면 `tls` 지시어 없이도 HTTPS가 됩니다.
Pingclair는 ACME로 Let's Encrypt에 인증서를 요청하고, 80 포트에서 HTTP-01
챌린지에 응답하고, 결과를 저장하고, 백그라운드에서 갱신합니다. 나머지 세 가지
방법 — DNS-01, 로컬 인증 기관, 직접 준비한 파일 — 은 각각 무엇이 필요한지와
무엇이 필요한지를 아래에 적었습니다.

## 🧾 시작하기 전에

- 이 호스트로 해석되는 이름. 서버를 의심하기 전에 확인하십시오:
  `dig +short A example.com`.
- 인터넷에서 도달 가능한 80과 443 포트. HTTP-01 챌린지는 80에서 응답하고,
  인증서는 443에서 쓰입니다.
- ACME 계정용 이메일 주소. 실제 사서함이어야 합니다. Let's Encrypt는 예약된
  example 도메인을 거부하며 발급은
  `contact email has forbidden domain "example.com"`로 실패합니다.

아래 설정은 서비스가 실행하는 `/etc/Pingclair/Pingclairfile`을 교체합니다.
다시 읽기 전에 검증하십시오. 그 흐름은
[퀵스타트](/ko/start/quickstart/)에, 재적용의 의미는
[서비스로 실행](/ko/start/service/)에 있습니다.

## 🌐 Let's Encrypt 인증서

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

설정할 것은 이것뿐입니다. 시작할 때 서버가 호스트 이름을 허가하고, ACME 흐름을
시작하고, 챌린지에 응답합니다.

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

액세스 로그에 남는 챌린지 요청은 브라우저가 아니라 인증 기관에서 옵니다.

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

다른 머신에서 실제로 무엇이 제공되는지 확인합니다.

```bash
curl -I https://example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
etag: "493b-6ab1f452"
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

```text
subject=CN=example.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 22 02:35:03 2026 GMT
notAfter=Dec 21 02:35:02 2026 GMT
```

인증서 실체는 서비스 계정의 데이터 디렉터리,
`/var/lib/pingclair/.local/share/pingclair`에 보관됩니다——그 계정의 홈에서
바이너리가 풀어내는 경로이고, 다른 사용자로 명령을 돌릴 때
`PINGCLAIR_TLS_STORE`가 가리키는 경로이기도 합니다.

## 📡 DNS-01과 와일드카드

DNS-01은 80 포트에서 응답하는 대신 TXT 레코드를 게시해 이름에 대한 지배를
증명합니다. 와일드카드 인증서에는 이 방법이 필요합니다. 설정에는 공급자 블록이
필요합니다.

```caddyfile
{
    email bonjour@pingclair.com
}

*.example.com {
    tls {
        auto
        dns cloudflare <token>
        resolvers 1.1.1.1
        propagation_delay 10s
    }
    file_server /var/lib/pingclair/html
}
```

놓치기 쉬운 점이 두 가지 있습니다. 블록 안의 `auto` 줄이 이름을 발급 대상
목록에 올립니다. 이것이 없으면 서버는 `authorised for 0 hostname(s)`를 기록하고
인증서를 전혀 요청하지 않아, 모든 핸드셰이크가 `NO_CERTIFICATE_SET`으로
실패합니다. 또한 토큰은 그 이름을 담은 존에 대한 `Zone:DNS:Edit` 권한이 있는
Cloudflare API 토큰입니다.

🃏 **리프 하나가 사이트 전체를 덮습니다.** `*.example.com` 사이트는
`*.example.com` 자체를 주문합니다. 시작할 때 받은 인증서 한 장이 그 아래 모든
이름에 사용됩니다. 와일드카드는 정확히 한 레이블만 덮으므로 apex에는 별도 항목이
필요합니다 — `example.com`에서도 응답한다면
`*.example.com, example.com`이라고 쓰고, 각 주체는 적은 그대로 주문됩니다.
이렇게 제공되는 하위 도메인은 Certificate Transparency 로그에 남지 않습니다.
와일드카드를 쓰는 privacy상의 이유가 바로 이것입니다.

사이트 아래의 모든 이름이 그 리프 하나로 제공됩니다. 다른 머신에서:

```bash
curl -I https://anything.example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername anything.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName
```

```text
subject=CN=*.example.com
issuer=C=US, O=Let's Encrypt, CN=YE1
X509v3 Subject Alternative Name:
    DNS:*.example.com
```

## 🏛️ 내부 인증 기관의 인증서

사설 오리진 — 터널, 내부 호스트 이름, 실험용 머신 — 에는 Pingclair 자체를 인증
기관으로 쓸 수 있습니다.

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

사이트는 `CN=Pingclair Local Authority`가 10년 유효로 발급한 인증서로 응답하고,
루트는 저장소에 게시됩니다.

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

클라이언트는 아직 신뢰하지 않으므로 `-k` 없는 요청은 실패합니다. 루트를 시스템
신뢰 저장소에 넣습니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

`PINGCLAIR_TLS_STORE` 접두사가 중요합니다. `pingclair trust`는 실행한 사용자의
저장소(root라면 `/root/.local/share/pingclair`)를 보지만 서비스는
`/var/lib/pingclair/.local/share/pingclair`를 씁니다. 접두사가 없으면
`No internal CA root at /root/.local/share/pingclair/internal/root.crt`라고
답합니다.

루트를 신뢰한 뒤에는 같은 요청이 `-k` 없이 성공합니다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust`는 같은 저장소 접두사로 다시 제거합니다.

## 📜 직접 준비한 인증서

다른 시스템이 인증서를 발급한다면 `tls`를 파일로 향하게 합니다.

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

서비스는 `pingclair` 사용자로 실행되므로 그 사용자가 파일을 읽을 수 있어야
합니다. `validate`는 없는 경로를 첫 핸드셰이크에서 실패시키는 대신 거부합니다.

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ HTTPS가 뜨지 않을 때

- **`contact email has forbidden domain "example.com"`.** Let's Encrypt는 예약된
  example 도메인을 계정 연락처로 거부합니다. `email` 옵션에 실제 사서함을
  넣으십시오.
- **로그의 `NO_CERTIFICATE_SET`.** 서버에 인증서가 없는 이름으로 핸드셰이크가
  들어왔습니다. 바로 위 로그를 읽으십시오. `auto`가 없는 `tls` 블록은 발급을
  시작하지 않고, DNS-01은 이 릴리스에서 끝나지 않습니다.
- **챌린지가 제공되지 않음.** 80 포트가 방화벽에 막혔거나 다른 프로그램이 잡고
  있습니다. 인증 기관이 인터넷에서
  `http://your-name/.well-known/acme-challenge/`에 도달할 수 있어야 합니다.
- **이름이 이 호스트로 해석되지 않음.** `dig +short A your-name`은 인증 기관이
  접속할 대상을 보여 줍니다. 최근 변경 후에는 기대와 다른 경우가 많습니다.
- **반복되는 실패.** Let's Encrypt는 이름마다 검증 실패를 제한합니다. 원인을
  고친 뒤 재시도하십시오. 그렇지 않으면 재시도 자체가 오류가 됩니다.

## 🧭 다음 단계

- [서비스로 실행](/ko/start/service/): 유닛, 재적용의 의미, 로그.
- [`tls`](/ko/reference/directives/#tls): 지시어의 모든 모드와 옵션.
- [Pingclairfile](/ko/reference/pingclairfile/): 주소, 매처, 컴파일러가 받아들이는
  것.
