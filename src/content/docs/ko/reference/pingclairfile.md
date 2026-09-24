---
title: Pingclairfile
h1_emoji: '📖'
description: 어휘 규칙, 사이트 주소, 매처, 라우트 순서, 스니펫, 그리고 파일을 검사하는 도구까지 Pingclairfile의 구조를 설명합니다.
---

Pingclairfile은 Caddyfile 언어로 작성하는 Pingclair의 설정 파일입니다. 선택 사항인
전역 옵션 블록 하나와, 사이트마다 하나씩 디렉티브를 담은 블록으로 이루어집니다.
지원하는 디렉티브만 쓴 Caddyfile은 그대로 로드됩니다. 이 페이지는 언어를 설명하며,
각 디렉티브가 하는 일은 [디렉티브 레퍼런스](/ko/reference/directives/)에 있습니다.

📌 이 페이지는 최신 공개 릴리스인 **v0.2.0-rc.3**을 설명합니다.

## 🔤 어휘 규칙

| 규칙 | 설명 |
| --- | --- |
| 주석 | `#`부터 줄 끝까지입니다. |
| 따옴표 | 공백이 들어간 값은 `"`로 감쌉니다. 값을 파싱하기 전에 따옴표는 제거됩니다. |
| 기간 | `30s`, `5m`, `1h`처럼 단위를 붙여 씁니다. 기간이 와야 할 자리에 숫자만 쓰면 거부됩니다. |
| 대소문자 | 디렉티브와 옵션 이름은 소문자입니다. |
| 플레이스홀더 | `{host}`, `{path}`, `{args[0]}`, `{block}` 등 플레이스홀더는 각 디렉티브가 문서에 밝힌 곳에서 확장됩니다. |

## 🌐 주소

사이트 블록의 이름은 주소입니다. 주소는 사이트가 어느 포트에서 수신할지, HTTPS로
서비스할지를 정합니다.

```text
example.com {          # HTTPS on 443 with a public certificate; 80 redirects
example.com:8443 {     # HTTPS on 8443: a host with a port is still HTTPS
localhost:8080 {       # HTTPS on 8080, from the internal authority
:8080 {                # plaintext HTTP on 8080, for any host
http://example.com {   # plaintext HTTP on 80
```

Caddy와 마찬가지로 스킴 없이 포트가 붙은 호스트는 HTTPS로 서비스됩니다. 어떤
포트에서든 평문을 원하면 주소 앞에 `http://`를 씁니다. 포트를 공유하는 두 사이트는
TLS 여부가 같아야 하며, 그렇지 않으면 설정이 거부됩니다.

## 🧭 매처

매처는 디렉티브를 일부 요청으로 한정합니다. `/api/*` 같은 경로처럼 인라인으로 쓰거나,
`@name`으로 한 번 선언하고 그 이름으로 참조합니다.

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` 블록은 디렉티브를 하나의 라우트로 묶습니다. 같은 수준의 `handle` 블록은
서로 배타적이어서 그중 정확히 하나만 실행되며, 매처가 없는 `handle`은 사이트의
폴백입니다. v0.2.0-rc.3에서는 일치하는 경로가 가장 구체적인 블록이 실행됩니다.
**다음 릴리스**: 정렬 순서에서 가장 앞선 블록이 실행됩니다. 긴 경로가 짧은 경로보다
앞서고, 그 밖에는 파일에 쓴 순서를 따릅니다
([어떤 라우트가 응답하는가](#-어떤-라우트가-응답하는가) 참고).

`client_ip`는 `trusted_proxies`를 적용한 뒤의 클라이언트 주소와 일치합니다.
**다음 릴리스**: `remote_ip`는 Caddy처럼 연결 자체의 피어와 일치하게 됩니다.
v0.2.0-rc.3에서는 둘 다 포워딩된 클라이언트와 일치합니다.

## 🧭 어떤 라우트가 응답하는가

v0.2.0-rc.3에서는 여러 라우트가 요청과 일치하면, 어디에 쓰였든 경로가 가장 구체적인
라우트가 응답합니다.

**다음 릴리스**: 라우트는 Caddy의 디렉티브 순서대로 시도되며, 처음 일치하는 것이
응답합니다. 예를 들어 `respond`는 `file_server`보다 순위가 앞서므로, 아래 사이트에서
`/assets/a.txt`는 파일 대신 `hello`를 받습니다.

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

좁은 라우트를 앞에 두려면 라우트를 `handle` 블록으로 감싸거나, 전역 `order` 옵션으로
디렉티브 순서를 옮기거나, 쓴 순서를 유지하는 `route` 블록에 나열합니다.

## 🧩 스니펫과 import

스니펫은 재사용 가능한 조각입니다. `(name) { ... }`로 선언한 스니펫은
`import name`으로 가져오며, 호출하는 쪽에서 블록을 받을 수 있습니다.

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

`{args[0]}`은 스니펫 이름 뒤의 첫 번째 인자이고, `{block}`은 호출하는 쪽이 넘긴
블록입니다. 블록을 넘기지 않으면 `{block}`은 빈 내용으로 확장되며, 스니펫은 그래도
컴파일됩니다.

## 🧰 명령줄 도구

설정을 작성할 때 도움이 되는 명령이 세 가지 있습니다.

- `pingclair validate`는 파일을 컴파일하고 첫 번째 문제를 알려 줍니다.
- `pingclair adapt --pretty`는 파일이 컴파일된 JSON을 출력합니다.
- `pingclair fmt`는 파일을 정리합니다.

모든 하위 명령과 플래그는 [명령줄](/ko/reference/command-line/)에 있습니다.

## 🚫 언어에 포함되지 않는 것

Caddyfile 언어는 Pingclair가 구현한 것보다 많은 디렉티브와 옵션을 정의합니다.
Pingclair가 인식하지만 구현하지 않은 이름은 파일을 로드할 때 빠진 기능을 밝히는
메시지와 함께 거부되므로, 설정이 일부를 조용히 빠뜨린 채 실행되는 일은 없습니다.
전체 목록은 서버 저장소의 README에 있으며, [프로젝트 상태](/ko/project/status/)에
요약되어 있습니다.
