---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: 공개 이름용 인증서를 받거나, 내부 인증서를 게시하거나, 직접 준비한 인증서를 사용하고, 서버가 실제로 무엇을 제공하는지 확인합니다.
---

주소가 공개 이름인 사이트 블록은 `tls` 디렉티브 없이도 HTTPS가 적용됩니다.
Pingclair가 ACME로 Let's Encrypt에 인증서를 요청하고, 80번 포트에서 HTTP-01
챌린지에 응답하고, 결과를 저장한 뒤 백그라운드에서 갱신합니다. 인증서를 얻는 나머지
세 방법, 즉 DNS-01, 로컬 인증 기관, 직접 준비한 파일은 각각 무엇이 필요한지와 함께
아래에서 설명합니다.

## 🧾 시작하기 전에

- 이 호스트로 해석되는 이름이 필요합니다. 서버를 의심하기 전에 먼저
  `dig +short A example.com`으로 확인합니다.
- 인터넷에서 80번과 443번 포트에 접근할 수 있어야 합니다. HTTP-01 챌린지는 80번
  포트에서 제공되고, 인증서는 443번에서 사용됩니다.
- ACME 계정용 이메일 주소가 필요합니다. 실제 메일함이어야 합니다. Let's Encrypt는
  예약된 예시 도메인을 거부하며, 발급은
  `contact email has forbidden domain "example.com"`으로 실패합니다.

아래 설정은 서비스가 실행하는 `/etc/Pingclair/Pingclairfile`을 대체합니다. 리로드
전에 검증합니다. 그 과정은 [빠른 시작](/ko/start/quickstart/)에, 리로드의 의미는
[서비스로 실행하기](/ko/start/service/)에 있습니다.

## 🌐 Let's Encrypt 인증서

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

더 설정할 것은 없습니다. 시작할 때 서버는 호스트 이름을 승인하고, ACME 절차를
시작하고, 챌린지를 제공합니다.

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

액세스 로그에 남는 챌린지 요청은 브라우저가 아니라 인증 기관이 보낸 것입니다.

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

실제로 무엇이 제공되는지 다른 머신에서 확인합니다.

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

인증서 자료는 서비스 사용자의 데이터 디렉터리인
`/var/lib/pingclair/.local/share/pingclair`에 보관됩니다. 바이너리가 그 계정의 홈
디렉터리에서 도출하는 경로이며, 다른 사용자로 명령을 실행할 때
`PINGCLAIR_TLS_STORE`로 지정하는 경로이기도 합니다.

## 📡 DNS-01과 와일드카드

DNS-01은 80번 포트에서 응답하는 대신 TXT 레코드를 게시해 이름의 소유를
증명합니다. 와일드카드 인증서에는 반드시 필요하며, 80번 포트가 닫힌 호스트에도
필요합니다.

⚠️ **v0.2.0-rc.3에서는 DNS-01이 완료되지 않습니다.** 이 릴리스는 TXT 레코드에 잘못된
값을 게시하므로 모든 주문이 `Invalid`로 끝납니다. 수정 사항과 아래에서 설명하는 단일
와일드카드 인증서는 `main`에 있으며 아직 릴리스되지 않았습니다. 지금 DNS-01을
쓰려면 설치 프로그램의 `--main` 플래그로 `main`을 설치합니다
([설치](/ko/start/install/#-릴리스-바이너리로-설치하기)). 이 절의 출력은 그 빌드의
동작입니다.

설정에는 프로바이더 블록이 필요합니다.

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

놓치기 쉬운 점이 두 가지 있습니다. 첫째, 블록 안의 `auto` 줄이 이름을 발급 목록에
올립니다. 이 줄이 없으면 서버는 `authorised for 0 hostname(s)`를 기록하고 인증서를
요청하지 않으므로, 모든 핸드셰이크가 `NO_CERTIFICATE_SET`으로 실패합니다. 둘째,
토큰은 해당 이름이 속한 존에 대해 `Zone:DNS:Edit` 권한을 가진 Cloudflare API
토큰이어야 합니다.

🃏 **리프 인증서 하나가 사이트 전체를 담당합니다.** `*.example.com` 사이트는
`*.example.com` 자체를 주문합니다. 인증서 하나를 시작할 때 받아 그 아래의 모든
이름에 제공합니다. 와일드카드는 레이블 하나만 대신하므로 apex 도메인은 별도로
적어야 합니다. 사이트가 `example.com`에서도 응답해야 한다면
`*.example.com, example.com`으로 쓰며, 각 주체는 쓴 그대로 주문됩니다. 이렇게
서비스되는 하위 도메인은 Certificate Transparency 로그에 나타나지 않는데, 애초에
와일드카드를 쓰는 개인정보 측면의 이유가 이것입니다.

사이트 아래의 어떤 이름이든 그 리프 인증서 하나로 서비스됩니다. 다른 머신에서
확인합니다.

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

터널, 내부 호스트 이름, 실험용 머신처럼 비공개 오리진에서는 Pingclair가 직접 인증
기관 역할을 할 수 있습니다.

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

사이트는 `CN=Pingclair Local Authority`가 10년 유효기간으로 발급한 인증서로
응답하며, 루트 인증서는 저장소에 게시됩니다.

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

클라이언트는 아직 이 루트를 신뢰하지 않으므로 `-k` 없는 요청은 실패합니다. 루트를
시스템 신뢰 저장소에 설치합니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

`PINGCLAIR_TLS_STORE` 접두사가 중요합니다. `pingclair trust`는 실행한 사용자의
저장소를 찾는데, root라면 `/root/.local/share/pingclair`이고 서비스는
`/var/lib/pingclair/.local/share/pingclair`를 씁니다. 접두사가 없으면
`No internal CA root at /root/.local/share/pingclair/internal/root.crt`라고
응답합니다.

루트를 신뢰하고 나면 같은 요청이 `-k` 없이 성공합니다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust`는 같은 저장소 접두사로 루트를 다시 제거합니다.

📌 **다음 릴리스**. 다음 릴리스는 내부 인증 기관을 Caddy와 같은 방식으로 저장소의
`pki/authorities/local/` 아래에 두고, 리프 인증서는 중간 인증서가 서명합니다. 기존
`internal/` 디렉터리는 마이그레이션되지 않습니다. 업그레이드 후 서버는 새 루트를
만들며, 모든 클라이언트가 `pingclair trust`로 이를 다시 신뢰해야 합니다.

## 📜 직접 준비한 인증서

다른 시스템이 인증서를 발급한다면 `tls`에 파일 경로를 지정합니다.

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

서비스가 `pingclair` 사용자로 실행되므로 이 사용자가 파일을 읽을 수 있어야 합니다.
`validate`는 존재하지 않는 경로를 첫 핸드셰이크에서 실패하게 두지 않고 미리
거부합니다.

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ HTTPS가 올라오지 않을 때

- **`contact email has forbidden domain "example.com"`.** Let's Encrypt는 예약된
  예시 도메인을 계정 연락처로 받지 않습니다. `email` 옵션에 실제 메일함을 넣습니다.
- **로그에 `NO_CERTIFICATE_SET`이 보입니다.** 서버에 인증서가 없는 이름으로
  핸드셰이크가 들어왔습니다. 바로 위의 로그를 읽습니다. `auto`가 없는 `tls` 블록은
  발급을 시작하지 않으며, 이 릴리스에서는 DNS-01이 완료되지 않습니다.
- **챌린지가 제공되지 않습니다.** 방화벽이 80번 포트를 막고 있거나 다른 프로세스가
  포트를 쓰고 있습니다. 인증 기관이 인터넷에서
  `http://your-name/.well-known/acme-challenge/`에 접근할 수 있어야 합니다.
- **이름이 이 호스트로 해석되지 않습니다.** `dig +short A your-name`은 인증 기관이
  접속할 곳을 보여 줍니다. 최근에 변경했다면 예상과 다를 수 있습니다.
- **실패가 반복됩니다.** Let's Encrypt는 호스트 이름별로 실패한 검증 횟수를
  제한합니다. 원인을 고친 뒤에 재시도해야 하며, 그렇지 않으면 재시도 자체가 오류가
  됩니다.

## 🧭 다음 단계

- [서비스로 실행하기](/ko/start/service/): 유닛, 리로드 방식, 로그를 다룹니다.
- [`tls`](/ko/reference/directives/#tls): 이 디렉티브의 모든 모드와 옵션입니다.
- [Pingclairfile](/ko/reference/pingclairfile/): 주소, 매처, 그리고 컴파일러가
  받아들이는 것을 설명합니다.
