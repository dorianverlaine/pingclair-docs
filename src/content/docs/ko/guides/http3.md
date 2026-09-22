---
title: HTTP/3 서비스
h1_emoji: '⚡'
sidebar:
  order: 4
description: HTTP/3를 켜고, 클라이언트가 실제로 사용했음을 증명하고, QUIC에서 다르게 동작하는 요청을 알아 둡니다.
---

HTTP/3는 무엇을 설치할 필요가 없다는 뜻에서 기본으로 켜져 있습니다. 프로토콜 집합이
허락하면 서버는 UDP 443에 QUIC 리스너를 엽니다. 주의가 필요한 것은 검증입니다.
조용히 HTTP/2로 떨어진 클라이언트는 성공과 똑같이 보입니다.

## 🧾 시작하기 전에

- 호스트로 해석되는 이름과 그 이름의 인증서([HTTPS](/ko/start/https/)).
- 제공자 방화벽과 호스트 양쪽에서 **UDP 443 개방**. QUIC에는 대체가 없습니다.
  UDP가 막히면 클라이언트는 HTTP/2를 쓰고 그 사실을 말하지 않습니다.
- HTTP/3를 지원하는 클라이언트. 대부분의 배포판 `curl`은 지원하지 않으며,
  요구하면 분명히 알려 줍니다.

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 켜기

```caddyfile
{
    email pingclair@aqeo.dev
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

사이트를 띄운 상태에서 호스트에서 측정:

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

목록에서 `h3`를 빼면 이 리스너가 사라집니다. 목록이 스위치입니다
([TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/#-which-protocols-are-served)).
리스너를 멈추지 않고 사이트 하나만 HTTP/3에서 빼낼 수도 있습니다.

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

## ✅ 클라이언트가 사용했음을 증명하기

서버의 액세스 로그는 프로토콜을 말하지 않으므로 증거는 클라이언트에서 옵니다.
ngtcp2나 quiche로 빌드된 curl이면 무엇이든 되고, HTTP/3를 못 쓰는 curl만 있는
호스트에서는 컨테이너가 가장 빠릅니다.

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

`--network host`가 컨테이너에 호스트의 UDP 경로를 쓰게 합니다. 없으면 QUIC를 막는
네트워크 네임스페이스를 지날 수 있습니다.

첫 줄이 답입니다. 상태 줄이 `HTTP/2`가 아니라 `HTTP/3`입니다. 같은 URL을 `--http2`와
`--http1.1`로 요청하면 나머지 둘이 나오므로, 클라이언트가 단순히 떨어진 것이 아님을
알 수 있습니다.

컨테이너를 쓸 수 없으면 QUIC 핸드셰이크는 시스템 OpenSSL 3.5 이상으로 확인할 수
있습니다.

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3`와 검증된 체인은 그 이름에 대해 QUIC 리스너가 클라이언트가
신뢰하는 인증서로 응답한다는 뜻입니다. 완전한 HTTP/3 요청을 증명하지는 않으며, 그
역할은 curl 확인입니다.

## 🧭 HTTP/3에서 다른 것

정책 계층은 HTTP/1.1, HTTP/2와 공유하므로 라우팅, 매처, 헤더, 속도 제한, 액세스
로그는 같게 동작합니다. 다른 것은 전송이 무언가를 실을 수 없는 곳입니다.

| 영역 | HTTP/3에서 |
| --- | --- |
| 선언된 요청 트레일러 | 전달되지 않습니다. 응답 확정 전에는 `501`, 확정 뒤에는 스트림 재설정. |
| 업스트림 응답 트레일러 | `502`. |
| `CONNECT`와 확장 `CONNECT` | 터널 구현 전까지 `501`. |
| `php_fastcgi` | `501`. FastCGI는 HTTP/1.1과 HTTP/2에서만 서비스됩니다. |

앞에 CDN이 있으면 HTTP/3를 종료하는 것은 CDN이고 오리진과는 HTTP/1.1이나 HTTP/2로
말합니다. 따라서 여기 리스너는 방문자의 브라우저가 무엇을 썼는지 증명하지 않습니다.
그것은 CDN 쪽 HTTP/3 설정을 확인하십시오.

## ⚠️ 잘 되지 않을 때

- **`option --http3: the installed libcurl version doesn't support this`.**
  클라이언트에 HTTP/3가 없습니다. 위의 컨테이너를 쓰십시오.
- **`curl --http3`가 멈추거나 시간 초과.** 어딘가에서 UDP 443이 막혔습니다. 먼저
  제공자 방화벽이나 보안 그룹, 다음 호스트를 확인하십시오.
- **호스트에 UDP 리스너가 없음.** 프로토콜 목록에 `h3`가 없거나, 실행 중인 파일이
  편집한 파일이 아닙니다
  ([재적용의 의미](/ko/start/service/#-what-a-reload-means)).
- **로컬에서는 되고 밖에서는 안 됨.** 클라이언트 네트워크가 UDP 443을 막습니다.
  기업과 호텔에서 흔하고, 브라우저는 조용히 떨어집니다.
- **FastCGI 경로가 `501`을 반환.** HTTP/3에서는 설계대로입니다.
  [프로젝트 상태](/ko/project/status/)에 무엇이 어디서 서비스되는지 있습니다.

## 🧭 다음 단계

- [TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/): 프로토콜 목록, 인증서,
  클라이언트 인증서.
- [프로젝트 상태](/ko/project/status/): 이 릴리스가 지원하고 거부하며 알려진 결함.
- [`tls`](/ko/reference/directives/#tls): `http3` 옵션의 맥락.
