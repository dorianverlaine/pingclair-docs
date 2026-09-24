---
title: 디렉티브
h1_emoji: '🧾'
description: 이 레퍼런스가 다루는 Pingclairfile 디렉티브와 전역 옵션의 구문, 기본값, 사용 위치, 거부 조건, Caddy와의 차이를 정리합니다.
---

각 항목은 정해진 머리글로 시작합니다. 구문, 디렉티브가 없을 때의 기본값, 그리고
디렉티브를 쓸 수 있는 위치입니다. 이어서 디렉티브가 하는 일, 거부하는 것, Caddy와
다른 점을 설명합니다.

📌 이 페이지는 최신 공개 릴리스인 **v0.2.0-rc.3**을 설명합니다. 다음 릴리스에서
동작이 바뀌는 경우 해당 항목에 **다음 릴리스**로 표시합니다. 그 동작은 서버의
`main` 브랜치에 있으며 아직 공개 빌드에는 없습니다.

📖 이 페이지는 언어의 일부만 다룹니다. 여기에 없는 디렉티브도 `pingclair validate`가
검사하며, 서버가 구현하지 않은 디렉티브는 받아들여 무시하는 대신 이름을 밝혀
거부합니다.

## basic_auth

```text
Syntax:   basic_auth [<matcher>] [bcrypt|argon2id [<realm>]] {
              <username> <hashed_password>
              ...
          }
Default:  no authentication
Context:  site block, handle, route
```

요청이 더 진행되기 전에 HTTP Basic 자격 증명을 요구합니다. 블록의 각 줄이 계정
하나이며, 사용자 이름과 비밀번호 해시로 이루어집니다. 비밀번호 자체를 쓰는 일은
없습니다. 해시는 `pingclair hash-password`로 만듭니다
([명령줄](/ko/reference/command-line/#pingclair-hash-password)).

디렉티브 줄의 알고리즘은 블록 안의 모든 해시를 검사하는 데 쓰이며, 기본값은
`bcrypt`입니다. 다른 알고리즘 이름은 거부되며, 블록이 없는 `basic_auth`도
거부됩니다.

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode off
Default:  gzip in v0.2.0-rc.3; no compression in the next release
Context:  site block
```

응답을 압축합니다. 형식은 선호 순서대로 나열합니다. 클라이언트가 여러 형식을
받아들이면 먼저 나열한 형식이 이깁니다. 지원 형식은 `zstd`와 `gzip`이며, 인자 없는
`encode`는 `gzip`을 뜻합니다. `encode off`는 사이트의 압축을 끕니다.

거부 조건:

- `encode br`은 로드 시점에 거부됩니다. 프록시에는 스트리밍 Brotli 인코더가 없으며,
  서버가 조용히 gzip으로 대신하지 않습니다.
  `` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- 알 수 없는 형식은 유효한 형식 목록과 함께 거부됩니다.
- 경로 매처나 이름 있는 매처는 거부됩니다. 압축은 라우트가 아니라 사이트 단위로
  설정하기 때문입니다. 모든 것과 일치하는 `*` 매처는 받아들입니다.

Caddy와의 차이: v0.2.0-rc.3에서는 `encode` 줄이 없는 Pingclairfile 사이트도 gzip으로
압축합니다. Caddy는 `encode`가 요구한 곳에서만 압축합니다.

**다음 릴리스**: Caddy처럼 `encode`가 요구한 곳에서만 압축합니다. 이전 기본값에
의존하던 사이트는 `encode gzip`이나 `encode zstd gzip`을 추가해야 합니다.

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse
              compress              [off|false]
              precompressed         [br|zstd|gzip ...]
              hide                  <paths...>
              status                <code>
              pass_thru
              disable_canonical_uris
              etag_file_extensions  <extensions...>
          }
Default:  disabled
Context:  site block, handle, route
```

디스크에서 파일을 제공합니다. MIME 타입을 판별하고, 바이트 범위 요청에 응답하며,
`ETag`와 `Last-Modified`를 보냅니다. 파일은 `root`로 지정한 사이트 루트, 또는 이
디렉티브에만 준 루트에서 가져옵니다.

- `index`는 디렉터리에 대해 시도할 파일을 지정합니다. 기본값은 `index.html`입니다.
- `browse`는 인덱스 파일이 없는 디렉터리의 목록을 렌더링합니다.
- `compress off`는 압축하는 사이트에서 이 파일 서버만 예외로 둡니다.
- `precompressed`는 클라이언트가 해당 인코딩을 받아들이면 `app.js.gz` 같은 사전 압축
  파일을 제공합니다. 인자가 없으면 순서는 `br zstd gzip`입니다.
- `hide`는 지정한 경로를 제공하지 않습니다. 여러 줄을 쓰면 누적됩니다.
- `status`는 점검 페이지용으로 모든 파일에 이 상태로 응답합니다.
- `pass_thru`는 없는 파일에 `404`로 응답하는 대신 다음 핸들러에 넘깁니다.
- `disable_canonical_uris`는 디렉터리에 슬래시를 덧붙이는 리디렉션을 끕니다.

거부 조건: 로컬 파일 시스템만 지원하므로 `fs`는 거부됩니다. 100–599 범위를 벗어난
`status`와 알 수 없는 하위 디렉티브도 거부됩니다.

Caddy와의 차이: 위치 인자 `<root>`는 Pingclair가 추가한 것입니다. Caddy에서는
`file_server` 뒤의 경로가 경로 매처입니다. 설정을 Caddy에서도 로드해야 한다면 `root`를
쓰는 편이 좋습니다.

**다음 릴리스**:

- `browse`가 옵션 블록을 받으며, `file_limit <n>`으로 목록에 표시할 항목 수를
  제한합니다. 목록 템플릿, `reveal_symlinks`, `sort`는 이름을 밝혀 거부됩니다.
- `GET`과 `HEAD` 외의 메서드에는 `Allow: GET, HEAD`와 함께 `405`로 응답합니다.
- 조건부 요청에 응답합니다. 일치하는 `If-None-Match`나 최신인 `If-Modified-Since`에는
  `304`를, 실패한 `If-Match`나 `If-Unmodified-Since`에는 `412`를 반환합니다.

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> [<value> [<replacement>]]
          header [<matcher>] {
              <field> <value>                  # set
              +<field> <value>                 # append
              -<field>                         # remove
              ?<field> <value>                 # set only if absent
              <field> <search> <replacement>   # regular-expression replace
              defer
          }
Default:  none
Context:  site block, handle, route
```

응답 헤더를 바꿉니다. 필드 이름만 쓰면 헤더를 설정하고, `+` 접두사는 값을 덧붙이며,
`-` 접두사는 필드를 제거합니다. `?` 접두사는 응답에 그 필드가 아직 없을 때만 값을
설정합니다. 인자가 세 개이면 두 번째는 정규 표현식이고, 세 번째가 일치한 부분을
대체합니다.

헤더는 항상 완성된 응답에 적용되므로, `defer`와 `>` 접두사는 받아들이지만 아무것도
바꾸지 않습니다.

거부 조건:

- 인자와 블록을 모두 가진 디렉티브는 거부됩니다.
- 값 없는 `header X-Name`은 거부됩니다. Caddy는 빈 값을 설정하지만, 빈 응답 헤더는
  거의 언제나 제거를 잘못 쓴 것입니다.
- 블록 안의 `match` 응답 매처는 구현되지 않았으므로 거부됩니다.

⚠️ `set` 키워드는 없습니다. 블록 안의 `set X-Name value` 줄은 `set`이라는 이름의
헤더에 대한 정규 표현식 치환으로 읽힙니다.

**다음 릴리스**: RFC 6797이 요구하는 대로 `Strict-Transport-Security`는 암호화된
응답에만 보내고, 모든 평문 응답에서는 제거합니다. HSTS를 켜려면
`header Strict-Transport-Security "max-age=…"`를 씁니다.

```caddyfile
example.com {
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -X-Powered-By
    }
}
```

## log

```text
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; named channels in global options
```

액세스 로그를 씁니다. 네 가지 형태는 의미가 각각 다릅니다.

- `log`는 사이트의 기본 액세스 로그를 표준 출력으로 켭니다.
- `log { … }`는 사이트의 액세스 로그를 설정합니다.
- `log <name> { … }`는 별도의 출력을 가진 이름 있는 로거를 사이트에 추가합니다.
- `log <name>`은 전역 옵션에서 `log <name> { … }`로 선언한 같은 이름의 채널로
  사이트의 기록을 보냅니다.

블록 옵션에는 `output`(`stdout`, `stderr`, `file <path>`), `format`(`json` 또는
`console`), `level`, `hostnames` 선택자, `include`와 `exclude` 필터, `sampling`,
그리고 파일 로테이션(`roll_size`, `roll_keep`, `roll_keep_for`, `mode`, `dir_mode`와
그 밖의 `roll_*` 옵션)이 있습니다.

거부 조건: 전역 채널은 사이트에 붙어 있지 않으므로 `hostnames`를 쓸 수 없습니다. 두 번
선언한 채널은 거부됩니다.

기록은 묶어서 씁니다. 따라가지 못하는 싱크는 기록을 버리고
`pingclair_access_log_dropped_total`로 셉니다.

**다음 릴리스**: 이름 없는 전역 `log { … }` 블록은 거부됩니다. v0.2.0-rc.3에서는
받아들이지만 아무 일도 하지 않습니다.

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] [<upstream> ...] { ... }
Default:  none
Context:  site block, handle, route
```

요청을 하나 이상의 업스트림으로 전달합니다. `lb_policy`는 요청을 업스트림에 나누는
방식을 정하며, v0.2.0-rc.3의 기본값은 `round_robin`입니다.

호스트 이름 업스트림은 전역 `dns_refresh`에서 정한 간격마다 다시 해석되므로, 새
주소로 재시작한 백엔드도 리로드 없이 따라갑니다. 조회에 실패하면 이전 주소가 순환에
남습니다.

능동 헬스 체크는 요청과 별도로 각 업스트림을 점검합니다. 실패한 업스트림은 사용자
요청이 닿기 전에 순환에서 빠지고, 설정한 횟수만큼 점검에 성공하면 복귀합니다.
`backup` 업스트림은 모든 주 업스트림을 쓸 수 없을 때만 사용됩니다.

거부 조건: 알 수 없는 옵션은 `Unknown directive 'reverse_proxy: dial_timeout'`처럼
전체 이름과 함께 거부됩니다. 타임아웃은 `transport http` 블록에 씁니다.

**다음 릴리스**:

- 기본 `lb_policy`가 Caddy의 기본값인 `random`이 됩니다. 현재 동작을 유지하려면
  `lb_policy round_robin`을 씁니다.
- `lb_policy first`는 항상 사용 가능한 첫 번째 업스트림을 고릅니다. v0.2.0-rc.3에서는
  `round_robin`처럼 동작합니다.
- Pingclair가 직접 만든 `502`나 `504`에는 `Proxy-Status: pingclair; error=…`가 붙어
  백엔드가 보낸 응답과 구별할 수 있습니다.

```caddyfile
:80 :8080 {
    reverse_proxy {
        lb_policy least_conn
        to 10.0.0.1:8080 {
            weight 3
        }
        to 10.0.0.2:8080
        to 10.0.0.3:8080 {
            backup
        }
        health_check {
            path /health
            interval 5s
            timeout 2s
            status 200 204
            consecutive_failure 3
            consecutive_success 2
        }
    }
}
```

각 옵션은 [리버스 프록시 가이드](/ko/guides/reverse-proxy/)에서 차례로 설명합니다.

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle, route
```

사이트 루트를 지정합니다. `file_server`, `try_files` 등 파일을 다루는 디렉티브가
경로를 해석할 기준 디렉터리입니다. `file_server`도 자체 루트를 받을 수 있지만, 여기서
지정하면 모든 디렉티브가 한 위치를 가리키게 됩니다.

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

사이트의 인증서를 어디서 얻을지 제어합니다. `tls` 줄이 없으면 공개 이름은 Let's
Encrypt에서 자동으로 인증서를 받습니다.

| 형태 | 동작 |
| --- | --- |
| `tls internal` | 영속적인 로컬 인증 기관에서 발급합니다. 클라이언트가 그 루트를 신뢰해야 하며, `pingclair trust`로 설치합니다. |
| `tls <cert> <key>`, 또는 블록 안의 `cert`와 `key` | 다른 곳에서 발급한 인증서와 키 파일을 씁니다. |
| `tls { auto }` | ACME로 공개 인증서를 받아 갱신합니다. 공개 이름의 기본 동작이기도 합니다. |

블록은 `acme_email`(또는 `email`), `http3`, `default_sni`, `client_auth`, 그리고
DNS-01 옵션(`dns`, `resolvers`, `dns_ttl`, `propagation_delay`,
`propagation_timeout`, `dns_challenge_override_domain`)도 받습니다.

`http3 off`는 이 사이트를 HTTP/3에서 제외합니다. QUIC 리스너를 만들거나 없애지는
않으며, 그것은 전역 `servers { protocols … }` 목록이 정합니다
([TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/#-어떤-프로토콜을-서비스하는가)).

거부 조건:

- `dns`는 `cloudflare`만 받습니다. 다른 프로바이더는 거부됩니다.
  ``DNS provider `route53` is not implemented; this build ships `cloudflare` only``.
- `protocols`, `ciphers`, `curves`, `alpn`, `on_demand`, `key_type`, `issuer`, 그리고
  위에 없는 그 밖의 Caddy 옵션은 이름을 밝혀 거부됩니다.
- `tls internal`은 `auto`, ACME 이메일, 인증서 파일과 함께 쓸 수 없습니다.

**다음 릴리스**:

- `http3 off`에 효과가 생깁니다. v0.2.0-rc.3에서는 받아들이지만 아무 효과가 없습니다.
  해당 사이트의 응답은 더 이상 `Alt-Svc`로 HTTP/3를 알리지 않습니다.
- 내부 인증 기관의 루트가 Caddy와 같은 구성인
  `<store>/pki/authorities/local/root.crt`로 옮겨집니다. 기존 `<store>/internal/`
  트리는 마이그레이션되지 않습니다. 새 인증 기관이 만들어지며, 클라이언트가 그 루트를
  다시 신뢰해야 합니다.

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## Global options

전역 옵션은 파일 맨 위의 이름 없는 블록에 씁니다. `protocols`와 `trusted_proxies`처럼
Caddy가 `servers { … }` 아래에 두는 옵션도 이곳에서 받아들입니다.

| 옵션 | 구문 | 설명 |
| --- | --- | --- |
| `admin` | `admin [<address> [<token>]] \| off` | Admin API를 켭니다. 기본 주소는 `127.0.0.1:2019`입니다. 토큰이 없으면 루프백 클라이언트만 허용합니다. 이 옵션이 없으면 Admin API도 없습니다. |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 자동 HTTPS와 80번 포트 리디렉션을 제어합니다. `disable_certs`와 `ignore_loaded_certs`는 이름을 밝혀 거부됩니다. |
| `dns_refresh` | `dns_refresh <duration> \| off` | 호스트 이름 업스트림을 다시 해석하는 간격입니다. 기본값은 `30s`입니다. `off`는 시작할 때 해석한 주소를 유지합니다. 숫자만 쓰면 거부됩니다. |
| `email` | `email <address>` | ACME 계정 이메일입니다. |
| `grace_period` | `grace_period <duration>` | 정상 종료가 처리 중인 요청을 기다리는 시간입니다. |
| `protocols` | `protocols h1 h2 h3` | HTTP/3 리스너를 둘지 정합니다. [TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/#-어떤-프로토콜을-서비스하는가)을 참고합니다. |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | 포워딩 헤더로 클라이언트 주소를 알려도 되는 피어입니다. 바꾸려면 재시작이 필요합니다. **다음 릴리스**: Caddy식 표기인 `trusted_proxies static <cidr \| private_ranges> ...`도 받습니다. |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
