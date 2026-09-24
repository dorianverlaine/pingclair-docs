---
title: 정적 사이트 서비스하기
h1_emoji: '🗂️'
sidebar:
  order: 2
description: 압축, 캐시 헤더, 바이트 범위, 싱글 페이지 폴백, 그리고 닷파일을 감추는 규칙과 함께 디렉터리를 서비스합니다.
---

이 페이지는 파일 디렉터리를 서비스합니다. `root`와 `file_server`로 시작해 압축, 캐시
헤더, 범위 요청, 그리고 싱글 페이지 애플리케이션에 필요한 폴백을 더해 갑니다. 각
단계마다 실제 호스트에서 서버가 어떻게 응답했는지 보여 줍니다.

📌 이 페이지는 최신 공개 릴리스인 **v0.2.0-rc.3**을 설명합니다. 서버의 `main`
브랜치에만 있는 변경은 **다음 릴리스**로 표시합니다.

## 🧾 시작하기 전에

- Pingclair가 설치되어 실행 중이어야 하며([설치](/ko/start/install/)), 실험하는
  동안에는 서비스를 중지해 둡니다(`sudo pc service stop`).
- 서비스할 디렉터리가 필요합니다. 예시는 `/srv/site`를 씁니다.

## 📁 디렉터리 서비스하기

```caddyfile
http://:8080 {
    root * /srv/site
    file_server
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo systemctl restart pingclair
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Last-Modified: Tue, 22 Sep 2026 04:37:54 GMT
ETag: "5e-6ab20622"
Accept-Ranges: bytes
```

`root *`는 모든 요청에 사이트 루트를 지정하고, `file_server`는 그 아래의 파일을
제공합니다. 존재하지 않는 경로는 `404`로 응답합니다.

## 🗜️ 압축

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

`encode`는 선호하는 순서대로 형식을 나열합니다. 같은 36 KB 텍스트 파일을 서로 다른
`Accept-Encoding` 헤더 세 가지로 요청한 결과입니다.

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

프록시 응답에는 Brotli가 구현되어 있지 않으며, 요청하면 조용히 낮춰 적용되는 대신
컴파일 오류가 납니다.

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

메시지가 대안을 알려 줍니다. 서버가 할 수 없는 것을 요구하는 설정은 아예 실행되지
않습니다.

v0.2.0-rc.3에서는 `encode` 줄이 없는 사이트도 gzip으로 압축합니다. 디스크의 바이트를
그대로 제공하려면 `encode off`를 씁니다. **다음 릴리스**: Caddy처럼 `encode`가 요구한
곳에서만 압축하므로, 업그레이드할 때 `encode` 줄을 유지합니다.

## ⏳ 캐시 헤더

`file_server`는 `ETag`와 `Last-Modified`를 보내지만, v0.2.0-rc.3에서는
`If-None-Match`나 `If-Modified-Since`를 평가하지 않습니다. 재검증하는 클라이언트는
파일 전체를 다시 받습니다. **다음 릴리스**: 조건부 요청에 `304 Not Modified`나
`412 Precondition Failed`로 응답합니다.

클라이언트가 파일을 얼마나 오래 보관해도 되는지는 사이트가 정할 일이며, 그 판단이
맞는 경로에 둡니다.

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    header Cache-Control "public, max-age=60"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    file_server
}
```

측정 결과, 페이지에는 `Cache-Control: public, max-age=60`이, `/assets/*`에는
`public, max-age=31536000, immutable`이 붙었습니다. `immutable`은 내용이 바뀔 때마다
파일 이름도 바뀌는 경우에만 안전합니다. 빌드 도구가 애셋 이름에 콘텐츠 해시를 붙이는
이유가 이것입니다.

범위 요청은 설정이 필요 없습니다. 처음 10바이트를 요청한 클라이언트는 그만큼을
받습니다.

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 싱글 페이지 애플리케이션

브라우저에서 라우팅하는 애플리케이션은 알 수 없는 모든 경로에 진입 문서를 돌려줘야
하고, 실제 파일은 여전히 그 파일로 제공되어야 합니다.

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

측정 결과, `/assets/big.txt`는 여전히 자신의 내용으로 `200`을 응답하고,
`/some/spa/route`는 `index.html`로 `200`을 응답합니다. `try_files` 줄이 없으면 두
번째 요청은 `404`입니다.

## 🗂️ 디렉터리 목록

`file_server browse`는 인덱스 파일이 없는 디렉터리의 목록을 보여 줍니다.

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

목록에는 항목 이름이 나옵니다. `/assets/`는 `Index of` 제목 아래에 `big.txt`를
보여 줍니다. 디렉터리를 그렇게 보여 줄 의도가 아니라면 `browse`는 끄십시오.

## 🔒 파일 감추기

⚠️ 닷파일도 다른 파일처럼 제공됩니다. 위 설정에서 `.hidden`은 `200`으로
응답했습니다. `.git`, `.env`, 편집기 백업 파일이 인터넷에 노출되는 경로가 이것입니다.
이를 막으려면 파일 서버보다 먼저 해당 경로에 응답합니다.

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

측정 결과, `/.hidden`은 `404`로 응답하고 `/`와 `/assets/big.txt`는 여전히 `200`으로
응답합니다. `403`이 아니라 `404`인 것은 의도적입니다. `403`은 파일이 존재한다는
사실을 확인해 주기 때문입니다. `/.*`는 사이트 최상위의 닷파일에만 일치합니다.
위치와 관계없이 경로를 감추려면 `file_server { hide … }` 옵션을 씁니다.

## ⚠️ 잘 되지 않을 때

- **`Unsupported feature: 'encode br'`.** Brotli는 이름을 밝혀 거부됩니다.
  `encode zstd gzip`을 씁니다.
- **`Unknown directive 'file_server: …'`.** 존재하지 않는 옵션이며, `validate`는
  무시하는 대신 거부한 표기를 알려 줍니다.
- **페이지 대신 디렉터리 목록이 나옵니다.** 디렉터리에 `index.html`이 없습니다.
  원한 동작이거나, 파일이 빠진 것입니다.
- **애플리케이션이 처리하는 라우트가 `404`입니다.** 싱글 페이지 폴백이 빠졌습니다.
  `try_files {path} /index.html`을 추가합니다.
- **리로드 후에도 변경이 보이지 않습니다.** 파일은 요청마다 읽으므로 새 파일은
  리로드 없이 바로 보입니다. 리스너를 새로 만들거나 옮기려면 재시작이 필요합니다
  ([서비스로 실행하기](/ko/start/service/#-리로드의-의미)).

## 🧭 다음 단계

- [애플리케이션 리버스 프록시하기](/ko/guides/reverse-proxy/): 서버의 나머지 절반입니다.
- [`file_server`](/ko/reference/directives/#file_server): 디렉티브 레퍼런스입니다.
- [Pingclairfile](/ko/reference/pingclairfile/): 매처와 라우트 순서입니다.
