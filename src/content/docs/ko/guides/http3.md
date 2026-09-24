---
title: HTTP/3 서비스하기
h1_emoji: '⚡'
sidebar:
  order: 4
description: HTTP/3를 켜고, 클라이언트가 실제로 사용했는지 증명하고, QUIC에서 어떤 요청이 다르게 동작하는지 알아봅니다.
---

HTTP/3는 기본으로 켜져 있습니다. 전역 프로토콜 목록에서 `h3`를 빼지 않는 한 HTTPS
사이트에는 UDP 443의 QUIC 리스너가 생깁니다. 주의가 필요한 부분은 클라이언트가
실제로 HTTP/3를 썼는지 증명하는 일입니다. 조용히 HTTP/2로 돌아간 클라이언트도 겉보기에는
성공과 똑같기 때문입니다.

📌 이 페이지는 최신 공개 릴리스인 **v0.2.0-rc.3**을 설명합니다. 서버의 `main`
브랜치에만 있는 변경은 **다음 릴리스**로 표시합니다.

## 🧾 시작하기 전에

- 호스트로 해석되는 이름과 그 이름의 인증서가 필요합니다([HTTPS](/ko/start/https/)).
- 프로바이더와 호스트의 방화벽에서 **UDP 443이 열려 있어야** 합니다. QUIC에는 대체
  경로가 없습니다. UDP가 막혀 있으면 클라이언트는 아무 말 없이 HTTP/2를 씁니다.
- HTTP/3를 지원하는 클라이언트가 필요합니다. 대부분의 배포판에 기본으로 있는
  `curl`은 지원하지 않으며, 그래도 요청하면 이를 분명히 알려 줍니다.

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 켜기

```caddyfile
{
    email bonjour@pingclair.com
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

사이트가 실행 중인 호스트에서 측정한 결과입니다.

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

목록에서 `h3`를 빼면 이 리스너가 사라집니다. 목록이 곧 스위치입니다
([TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/#-어떤-프로토콜을-서비스하는가)).
`protocols` 줄이 없으면 HTTP/3는 켜진 채로 있습니다.

`tls` 블록은 사이트별 스위치도 받습니다.

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

⚠️ v0.2.0-rc.3에서 `http3 off`는 받아들여지지만 아무 효과가 없으며, 사이트는 여전히
QUIC으로 서비스됩니다. **다음 릴리스**: 리스너가 다른 사이트를 계속 서비스하는 동안
해당 사이트는 QUIC에서 제외되고, 그 응답은 더 이상 `Alt-Svc`로 HTTP/3를 알리지
않습니다.

## ✅ 클라이언트가 사용했는지 증명하기

증거는 클라이언트 쪽에서 나옵니다. ngtcp2나 quiche로 빌드한 curl이면 무엇이든 되며,
curl이 HTTP/3를 못 하는 호스트에서는 컨테이너가 가장 빠른 방법입니다.

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

`--network host`는 컨테이너가 호스트의 네트워크를 직접 쓰게 합니다. 이 옵션이 없으면
요청이 QUIC을 막는 네트워크 네임스페이스를 거칠 수 있습니다.

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

첫 줄이 답입니다. 상태 줄이 `HTTP/2`가 아니라 `HTTP/3`입니다. 같은 URL을 `--http2`와
`--http1.1`로 요청하면 나머지 두 프로토콜이 나오므로, 클라이언트가 다른 프로토콜로
돌아가고 있지 않다는 것도 확인됩니다.

컨테이너를 쓸 수 없다면, 시스템의 OpenSSL이 3.5 이상일 때 QUIC 핸드셰이크를 확인할
수 있습니다.

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

검증된 체인과 함께 나온 `ALPN protocol: h3`은 QUIC 리스너가 그 이름에 대해
클라이언트가 신뢰하는 인증서로 응답한다는 증거입니다. 완전한 HTTP/3 요청이
동작한다는 증거는 아니며, 그것은 curl 확인이 증명합니다.

## 🧭 HTTP/3에서 달라지는 것

HTTP/3는 HTTP/1.1, HTTP/2와 정책 코드를 공유하므로 라우팅, 매처, 헤더, 속도 제한,
FastCGI, 액세스 로그가 똑같이 동작합니다. 차이는 HTTP/3가 무언가를 실어 나를 수
없는 곳에 있습니다.

| 영역 | HTTP/3에서 |
| --- | --- |
| 선언된 요청 트레일러 | 전달하지 않습니다. 응답이 확정되기 전이면 `501`, 그 후면 스트림을 리셋합니다. |
| 업스트림 응답 트레일러 | `502`입니다. |
| `CONNECT` | Pingclair는 터널을 열지 않습니다. 표준 `CONNECT`는 잘못된 요청으로 보고 리셋하며, `:scheme`과 `:path`를 함께 가진 요청에는 `501`로 응답합니다. **다음 릴리스**: HTTP/1.1, HTTP/2와 같은 `Allow` 포함 `405`로 응답합니다. |

오리진 앞에 CDN이 있으면 CDN이 HTTP/3를 직접 종료하고 오리진과는 HTTP/1.1이나
HTTP/2로 통신합니다. 이때 이곳의 리스너는 방문자의 브라우저가 무엇을 썼는지 알려
주지 않으므로, CDN 자체의 HTTP/3 설정을 확인합니다.

## ⚠️ 잘 되지 않을 때

- **`option --http3: the installed libcurl version doesn't support this`.**
  클라이언트에 HTTP/3가 없습니다. 위처럼 컨테이너를 씁니다.
- **`curl --http3`가 멈추거나 시간 초과됩니다.** 어딘가에서 UDP 443이 막혀
  있습니다. 먼저 프로바이더의 방화벽이나 보안 그룹을, 그다음 호스트의 방화벽을
  확인합니다.
- **호스트에 UDP 리스너가 없습니다.** `servers` 프로토콜 목록에 `h3`가 없거나, 실행
  중인 파일이 수정한 파일이 아닙니다([리로드의 의미](/ko/start/service/#-리로드의-의미)).
- **로컬에서는 HTTP/3가 되는데 외부에서는 안 됩니다.** 클라이언트의 네트워크가 UDP
  443을 막고 있습니다. 회사나 호텔 네트워크에서 흔하며, 브라우저는 조용히 다른
  프로토콜로 돌아갑니다.
- **`http3 off`인 사이트가 여전히 HTTP/3로 응답합니다.** v0.2.0-rc.3에서는 이 옵션에
  효과가 없습니다. 어떤 사이트도 HTTP/3를 쓰면 안 된다면 전역 목록에서 `h3`를
  뺍니다.

## 🧭 다음 단계

- [TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/): 프로토콜 목록, 인증서,
  클라이언트 인증서입니다.
- [프로젝트 상태](/ko/project/status/): 이 릴리스에서 지원하는 것, 거부하는 것,
  알려진 결함입니다.
- [`tls`](/ko/reference/directives/#tls): 맥락 속의 `http3` 옵션입니다.
