---
title: 설정 모델
h1_emoji: '🧠'
description: Pingclairfile이 파싱, 컴파일, 검증되어 런타임 상태가 되기까지.
---

Pingclairfile은 로드 시점에 한 번 컴파일되어 서버가 실제로 실행하는 상태가 됩니다. 여기서 두 가지 결과가 나오며, 이것이 이 프로젝트의 대부분의 동작을 설명합니다. 설정이 결정할 수 있는 일은 첫 요청 전에 끝나고, 충족할 수 없는 설정은 요청 시점에 타협하는 대신 서버를 멈춥니다.

## 🗂️ 파일 구조

파일은 선택적인 global options 블록과 그 뒤를 잇는 하나 이상의 site block으로 구성됩니다.

```caddyfile
{
    email admin@example.com
}

example.com {
    encode zstd gzip
    reverse_proxy 10.0.0.10:8080 10.0.0.11:8080
}

:8080 {
    file_server ./public
}
```

- **Global options**는 파일 맨 앞의 이름 없는 블록에 쓰며, 사이트 단위가 아닌 상태를 설정합니다. ACME 계정 이메일, Admin API, 자동 HTTPS 동작, trusted proxies, 호스트 이름 업스트림의 DNS 재해석 등입니다. 사용 가능한 옵션은 [지시어 목록](/ko/reference/directives/#global-options)에 있습니다.
- **Site block**은 주소로 이름을 붙입니다. 호스트, 포트, 또는 둘 다입니다. 포트는 별도 지시어가 아니라 주소의 일부이므로 두 값을 일치시켜야 하는 곳이 한 곳뿐입니다.
- **지시어**는 site block 안의 문장입니다. 인수 목록을 받는 것, 중첩 블록을 받는 것, 둘 다 받는 것이 있습니다.
- **주석**은 `#`부터 줄 끝까지입니다.
- **공백이 있는 값은 따옴표로 묶습니다.** 시간 길이에는 단위가 필요합니다. `30s`는 30초이며, 길이가 필요한 자리에 맨 숫자 `30`을 쓰면 거부됩니다.

## 🧭 매처

매처는 어떤 지시어가 어느 요청에 적용될지 선택합니다. 이름 있는 매처는 `@name`으로 선언하고 이름으로 참조합니다.

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

`handle` 블록은 라우트별로 동작을 묶고, 매처가 없는 폴백도 지원합니다.

```caddyfile
example.com {
    handle /assets/* {
        file_server ./assets
    }

    handle {
        respond "Page Not Found" 404
    }
}
```

## 🧩 스니펫과 import

스니펫은 재사용 가능한 조각이며 `(name) { ... }`로 선언하고 `import name`으로 가져옵니다. 호출하는 쪽에서 블록을 받아 스니펫이 `{block}`을 쓴 자리에 끼워 넣을 수도 있습니다.

```caddyfile
(site) {
    https://{args[0]} {
        {block}
    }
}

import site example.com {
    reverse_proxy 127.0.0.1:3000
}
```

import된 파일에서 정의한 스니펫은 그 뒤의 import에서 볼 수 있습니다. 인수 목록 안에 놓인 자리 표시자는 거부됩니다. 지시어 트리는 삽입 후 그 줄을 토큰 계층처럼 다시 파싱할 수 없기 때문입니다.

## 🛡️ 검증

`pingclair validate`는 파일을 컴파일하고 의미 검사를 수행합니다. 지시어 인수, 매처 문법, 인증서와 키 경로, 그리고 "어떤 대응 지점이 클라이언트 식별 헤더를 주장할 수 있는가" 같은 정책 제약입니다.

실패는 명시적이며 닫힌 방향으로 처리됩니다.

- **구현되지 않은 이름은 이름으로 거부됩니다.** 형식이 정의한 이름은 모두 인식되며, 서버가 구현하지 않은 것은 "기능이 없다"는 메시지를 냅니다. 오타로 처리되거나 무시되지 않습니다. 그런 이름이 있는 설정은 시작하지 않습니다.
- **충족할 수 없는 옵션은 거부되고, 하향되지 않습니다.** 예를 들어 `encode`에 Brotli를 지정하면 컴파일 오류입니다. 프록시에 스트리밍 Brotli 인코더가 없기 때문이며, 조용히 gzip으로 대체하지 않습니다.
- **문법이 맞아도 없는 대상을 참조하면 거부됩니다.** 저장소의 `examples/full_featured.pingclair`는 올바른 Caddyfile 문법이지만 여전히 거부됩니다. 그 안의 인증서 경로가 검사를 실행하는 머신에 없기 때문이며, 거부가 옳습니다.

같은 검사가 로드 시점에도 실행되므로, 다시 로드할 때 검증에 실패하면 직전 상태가 그대로 유지됩니다.

## 🔁 다시 로드

재적용은 프로세스를 재시작하지 않고 설정을 다시 읽습니다. 신호는 `SIGUSR1`입니다.

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pingclair reload`는 Admin API를 거쳐 같은 코드에 도달하며, 서버가 그 파일을 어떻게 봤는지 보고합니다. 전역 옵션 블록의 `admin`이 필요합니다.

`pc service reload`는 설치된 유닛을 통해 이 신호를 보내므로, 당연해 보이는 명령이 곧 동작하는 명령입니다. 답은 종료 코드에 없습니다 — `systemctl reload`가 보고할 수 있는 것은 신호가 전달되었다는 사실뿐입니다 — 유닛의 status line과 저널에 있으며, 거부된 재적용은 이전 설정을 계속 실행합니다([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)은 그럼에도 성공을 보고하던 유닛 버전을 기록해 두었습니다). `trusted_proxies`처럼 시작 시점에 확립되는 프로세스 전역 정책은 재시작 후에 반영되며, 리스너를 바꾸는 설정도 재시작이 필요합니다.
