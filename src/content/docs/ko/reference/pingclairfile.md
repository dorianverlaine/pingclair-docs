---
title: Pingclairfile
h1_emoji: '📖'
description: 설정 언어 자체. 파일 구조, 주소, 매처, 스니펫, 도구.
---

Pingclairfile은 설정 언어입니다. Caddyfile 관례를 따라 선택적인 global options 블록과 지시어를 담은 site block으로 구성됩니다. 이 페이지는 언어 자체를 설명합니다. 받아들이는 지시어는 [지시어 목록](/ko/reference/directives/)을 참고하십시오.

## 🔤 어휘 규칙

| 규칙 | 내용 |
| --- | --- |
| 주석 | `#`부터 줄 끝까지. |
| 따옴표 | 공백이 있는 값은 `"`로 묶습니다. 따옴표는 파싱 전에 제거됩니다. |
| 시간 길이 | 단위가 필요합니다. `30s`, `5m`, `1h`. 길이가 필요한 자리에 맨 숫자를 쓰면 거부됩니다. |
| 대소문자 | 지시어와 옵션 이름은 소문자입니다. |
| 자리 표시자 | `{host}`, `{path}`, `{args[0]}`, `{block}` 등은 각 지시어가 정한 위치에서 전개됩니다. |

## 🌐 주소

Site block은 주소로 이름을 붙입니다. 주소는 리스너를 정하고, 공개 이름이라면 자동 HTTPS 적용 여부도 정합니다.

```caddyfile
example.com {              # host: ports 443 and 80, automatic HTTPS
localhost:8080 {           # host and port
:8080 {                    # any host on this port
http://example.com {       # force plaintext
```

포트는 주소의 일부이며 별도의 `listen` 지시어가 아닙니다. 그래서 주소와 리스너가 어긋날 수 없습니다.

## 🧭 매처

매처를 받는 지시어는 일치하는 요청에만 적용됩니다. 매처는 줄 안에 쓰거나 `@name`으로 선언해 이름으로 참조합니다.

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` 블록은 라우트별로 지시어를 묶습니다. 매처가 없는 `handle`은 그 사이트의 폴백입니다.

## 🧩 스니펫과 import

스니펫은 재사용 가능한 조각입니다. `(name) { ... }`로 선언하고 `import name`으로 가져오며, 호출하는 쪽에서 블록을 받을 수도 있습니다.

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

아무것도 받지 못한 자리 표시자는 아무것도 삽입하지 않으므로, `{block}`을 쓴 스니펫은 호출하는 쪽이 블록을 주지 않아도 컴파일됩니다.

## 🧰 명령줄 도구

| 명령 | 용도 |
| --- | --- |
| `pingclair validate [path]` | 설정을 컴파일하고 검사합니다. 기본은 `./Pingclairfile`, 다음으로 `./Caddyfile`을 읽습니다. |
| `pingclair adapt --pretty` | 컴파일된 JSON 형식을 출력합니다. |
| `pingclair fmt [--diff] [--overwrite]` | Pingclairfile을 서식화하거나 차이만 표시합니다. |
| `pingclair run <path>` | 지정한 설정으로 서버를 실행합니다. |
| `pingclair list-modules` | 이 바이너리가 빌드 시 포함한 모듈을 나열합니다. |
| `pingclair build-info` | 사용한 도구 모음을 포함한 빌드 정보를 출력합니다. |

## 🚫 언어에 포함되지 않는 것

형식이 정의한 이름은 서버가 구현한 수보다 많습니다. 인식되지만 구현이 없는 이름은 로드 시점에 이름을 들어 거부하고 "기능이 없다"고 알립니다. 권위 있는 목록은 서버 저장소의 README에 있으며, [프로젝트 상태](/ko/project/status/) 페이지가 주요 분류를 정리합니다.
