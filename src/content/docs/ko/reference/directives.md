---
title: 지시어
h1_emoji: '🧾'
description: 이 문서가 다루는 지시어의 문법, 기본값, 적용 범위.
---

각 항목은 문법, 지정하지 않았을 때의 기본값, 쓸 수 있는 위치를 보여 줍니다. 버전 표기(어느 버전에서 도입되었는지 알려 주는 `Since:` 줄)는 아직 공개하지 않았습니다.

📖 이 페이지는 출발점이 되는 일부를 다룹니다. 여기에 없어도 받아들여지는 지시어는 `pingclair validate`가 검증합니다. 서버가 구현하지 않은 지시어는 조용히 받아들이지 않고 이름을 들어 거부합니다.

## encode

```text
Syntax:   encode <format> [<format> ...]
Default:  no compression
Context:  site block
```

응답을 압축합니다. 인수는 선호 순서대로 나열하며 클라이언트가 받아들이는 첫 형식을 사용합니다. 지원 형식은 `zstd`와 `gzip`입니다.

Brotli를 지정하면 gzip으로의 암묵적 하향이 아니라 컴파일 오류가 됩니다. 프록시에 스트리밍 Brotli 인코더가 없어 그 옵션을 충족할 수 없기 때문입니다.

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<root>]
Default:  disabled
Context:  site block
```

디스크에서 파일을 제공합니다. MIME 타입 판별, 범위 요청, ETag와 `Last-Modified` 검증을 지원합니다. 인수를 주면 이 지시어 자체의 루트가 되고, 생략하면 `root`로 설정한 사이트 루트를 씁니다.

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> <value>
          header [<matcher>] {
              <field> <value>      # set
              +<field> <value>     # append
              -<field>             # remove
              set <field> <value>  # set, spelled explicitly
          }
Default:  none
Context:  site block
```

응답 헤더를 추가, 교체, 제거합니다. 필드 이름만 쓰면 설정, `+`를 앞에 두면 추가, `-`를 앞에 두면 제거입니다.

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
Syntax:   log [<name>] { <options> }
Default:  no access sink
Context:  site block, global options
```

접근 로그 출력 대상을 설정합니다. 단독 `log`는 그 사이트의 기본 출력을 켜고, `log <name> { ... }`는 이름 있는 로거를 설정합니다. 블록이 없는 `log <name>`은 global options에서 선언한 채널을 참조합니다.

블록 옵션에는 출력 대상과 형식(`output`, `format`), `hostnames` 선택자, `include`와 `exclude` 필터, `sampling`, 그리고 파일 로테이션(`mode`, `dir_mode`, `roll_*`)이 있습니다.

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

레코드는 쓰기 전에 모아 두며, 따라가지 못하는 출력 대상은 레코드를 버리고 `pingclair_access_log_dropped_total`에 계산합니다. 모든 요청을 시스템 저널에 쓰는 경우 저널 수신 측의 처리 비용도 부담합니다.

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] { ... }
Default:  none
Context:  site block
```

요청을 하나 이상의 업스트림으로 전달합니다. 기본 부하 분산 정책은 라운드 로빈입니다. 호스트 이름 업스트림은 `dns_refresh` 간격으로 다시 해석되므로 새 주소로 재시작한 백엔드에도 개입 없이 따라갑니다. 해석에 실패하면 직전 주소를 로테이션에 남겨 둡니다.

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

능동 상태 확인은 대역 외에서 실행되므로 실패한 백엔드는 사용자 요청이 도달하기 전에 로테이션에서 빠지고, 설정한 횟수만큼 성공하면 복귀합니다. `backup` 업스트림은 모든 주 업스트림을 쓸 수 없을 때만 사용합니다.

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block
```

사이트 루트를 설정합니다. `file_server`는 자체 루트를 가질 수 있지만, 여기에서 설정하면 파일을 다루는 다른 지시어와 파일 서버가 같은 위치를 가리키게 됩니다.

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls <mode>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

인증서를 얻는 방법을 제어합니다.

| 모드 | 동작 |
| --- | --- |
| `tls auto` | ACME로 공개 인증서를 발급받고 자동으로 갱신합니다. |
| `tls internal` | 상주하는 로컬 인증 기관에서 발급합니다. 루트 인증서는 `$PINGCLAIR_TLS_STORE/internal/root.crt`에 있고 클라이언트가 신뢰해야 합니다. |
| `tls { cert ...; key ... }` | 블록에서 지정한 인증서와 키 파일을 사용합니다. |

블록 형식은 `http3`로 HTTP/3을 켜고 `dns cloudflare <token>`으로 DNS-01 발급도 지원합니다. 구현된 DNS 공급자는 이것뿐입니다. 다른 공급자 이름은 받아들이고 무시하는 대신 기동 시 거부됩니다. DNS-01이 와일드카드 인증서를 성립시키는 전제이기 때문입니다.

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
        http3
    }
    reverse_proxy localhost:3000
}
```

## 🌍 Global options

Global options는 파일 맨 앞의 이름 없는 블록에 씁니다.

| 옵션 | 문법 | 내용 |
| --- | --- | --- |
| `admin` | `admin <address> [<token>]` | Admin API 리스너. token이 없으면 루프백 연결만 받습니다. |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 자동 HTTPS와 80번 포트 리디렉션을 제어합니다. |
| `dns_refresh` | `dns_refresh <duration>` | 호스트 이름 업스트림의 재해석 간격. `off`는 기동 시 해석한 주소로 고정합니다. |
| `email` | `email <address>` | ACME 발급에 쓰는 계정 이메일. |
| `trusted_proxies` | `trusted_proxies <cidr> [<cidr> ...]` | 클라이언트 식별 헤더를 주장할 수 있는 대응 지점. 변경은 재시작이 필요합니다. |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
