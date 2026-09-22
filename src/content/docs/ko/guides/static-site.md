---
title: 정적 사이트 서비스
h1_emoji: '🗂️'
sidebar:
  order: 2
description: 압축, 캐시 헤더, 부분 요청, 단일 페이지 폴백, 그리고 점으로 시작하는 파일을 비공개로 유지하는 규칙과 함께 디렉터리를 서비스합니다.
---

파일 서비스는 Pingclair가 하는 일의 나머지 절반입니다. 이 페이지는 `root`와
`file_server`에서 시작해 압축, 캐시 헤더, 부분 요청, 단일 페이지 애플리케이션에
필요한 폴백까지 쌓아 올리고, 각 단계에서 서버가 실제로 무엇을 답하는지 보여 줍니다.

## 🧾 시작하기 전에

- Pingclair가 설치되어 실행 중이어야 합니다([설치](/ko/start/install/)). 실험하는
  동안에는 서비스를 멈춥니다: `sudo pc service stop`.
- 서비스할 디렉터리. 예제는 `/srv/site`를 씁니다.

## 📁 디렉터리 서비스

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

`root *`는 모든 요청에 사이트 루트를 지정하고 `file_server`가 그곳에서 서비스합니다.
없는 경로는 `404`를 답합니다.

## 🗜️ 압축

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

인수는 선호 순서입니다. 같은 36 KB 텍스트 파일을 세 가지 `Accept-Encoding`으로
요청한, 이 구성에서의 측정값:

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli는 프록시 응답에 구현되어 있지 않고, 요청하면 조용한 하향이 아니라 컴파일
오류가 됩니다.

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

메시지가 대안을 알려 줍니다. 서버가 지킬 수 없는 것을 요구하는 설정은 아예 실행되지
않습니다.

## ⏳ 캐시 헤더

`file_server`는 이미 조건부 요청에 응답합니다. 위의 `ETag`와 `Last-Modified`가
클라이언트가 `If-None-Match`나 `If-Modified-Since`로 되돌려 보내는 값입니다. 보관
기간은 당신이 정할 일이고, 그것이 참인 경로에 둡니다.

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

측정: 페이지에는 `Cache-Control: public, max-age=60`, `/assets/*`에는
`public, max-age=31536000, immutable`. immutable은 파일 이름이 내용과 함께 바뀔
때만 정직합니다. 그래서 빌드 도구가 이름에 해시를 붙입니다.

부분 요청에는 설정이 필요 없습니다. 앞 10바이트를 요청한 클라이언트는 그것을
받습니다.

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 단일 페이지 애플리케이션

브라우저에서 라우팅하는 애플리케이션은 알 수 없는 모든 경로에서 진입 문서를
돌려줘야 하고, 실제 파일은 계속 서비스되어야 합니다.

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

측정: `/assets/big.txt`는 자기 내용으로 여전히 `200`, `/some/spa/route`는
`index.html`로 `200`을 답합니다. `try_files` 줄이 없으면 두 번째는 `404`입니다.

## 🗂️ 디렉터리 목록

`file_server browse`는 index 파일이 없는 디렉터리의 목록을 그립니다.

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

목록은 항목 이름을 나열하므로 `/assets/`는 `Index of` 제목 아래 `big.txt`를
보여 줍니다. 그렇게 읽히게 하려는 디렉터리가 아니라면 `browse`는 붙이지 않습니다.

## 🔒 파일 숨기기

⚠️ 점으로 시작하는 파일도 다른 파일과 똑같이 서비스됩니다. 위 구성에서 `.hidden`은
`200`을 답했습니다. `.git`, `.env`, 편집기 백업이 인터넷에 나가는 경로가 이것입니다.
막으려면 파일 서버가 동작하기 전에 응답합니다.

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

측정: `/.hidden`은 `404`, `/`와 `/assets/big.txt`는 여전히 `200`. `403`이 아니라
`404`인 것은 의도적입니다. `403`은 파일이 있다는 사실을 확인해 줍니다.

## ⚠️ 잘 되지 않을 때

- **`Unsupported feature: 'encode br'`.** Brotli는 이름을 대며 거부됩니다.
  `encode zstd gzip`을 쓰십시오.
- **`Unknown directive 'file_server: …'`.** 그 옵션은 없고, `validate`는 무시하지
  않고 거부한 철자를 알려 줍니다.
- **페이지 대신 디렉터리 목록.** 그 디렉터리에 `index.html`이 없습니다. 의도한
  결과이거나 파일을 빠뜨린 것입니다.
- **애플리케이션이 처리하는 경로에서 `404`.** 단일 페이지 폴백이 없습니다:
  `try_files {path} /index.html`.
- **재적용 후에도 새 페이지가 안 보임.** 재적용이 적용하는 것은 정책이지 새
  리스너가 아닙니다. 파일은 요청마다 읽히므로 파일 추가는 즉시 반영되고 리스너
  이동은 그렇지 않습니다([서비스로 실행](/ko/start/service/#-재적용의-의미)).

## 🧭 다음 단계

- [애플리케이션 프록시하기](/ko/guides/reverse-proxy/): 서버의 나머지 절반.
- [`file_server`](/ko/reference/directives/#file_server): 지시어 레퍼런스.
- [`try_files`](/ko/reference/pingclairfile/): 폴백이 어떻게 컴파일되는지.
