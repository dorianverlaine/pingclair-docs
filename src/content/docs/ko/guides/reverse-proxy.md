---
title: 애플리케이션 프록시하기
h1_emoji: '🔀'
sidebar:
  order: 1
description: 애플리케이션 앞에 Pingclair를 두고, 여러 인스턴스에 트래픽을 나누고, 그중 하나가 죽어도 계속 서비스합니다.
---

리버스 프록시는 애플리케이션을 바꾸지 않고 하나 이상의 애플리케이션 인스턴스 앞에
공개 주소 하나를 둡니다. 이 페이지는 업스트림 하나에서 시작해 헬스 체크, 타임아웃,
백업을 갖춘 풀까지 쌓아 올리고, 마지막으로 반대편의 애플리케이션이 무엇을 보는지
설명합니다.

📌 이 페이지는 최신 공개 릴리스인 **v0.2.0-rc.3**을 설명합니다. 서버의 `main`
브랜치에만 있는 변경은 **다음 릴리스**로 표시합니다.

## 🧾 시작하기 전에

- Pingclair가 설치되어 실행 중이어야 하며([설치](/ko/start/install/)), 실험하는
  동안에는 서비스를 중지해 둡니다(`sudo pc service stop`).
- 로컬 포트에서 수신하는 애플리케이션이 필요합니다. 예시는 `127.0.0.1:3000`을
  씁니다.
- 프록시 자체가 쓸 포트가 필요합니다. 예시는 `:8080`입니다.

## 🔀 업스트림 하나

```caddyfile
{
    admin 127.0.0.1:2019
}

http://:8080 {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
curl -i http://localhost:8080/
```

응답은 애플리케이션의 헤더가 그대로 붙은 애플리케이션의 응답입니다. `admin`
옵션은 `pingclair reload`가 실행 중인 서버에 접근하게 해 줍니다. 위의 `SIGUSR1`
리로드는 이 옵션 없이도 동작합니다([리로드의 의미](/ko/start/service/#-리로드의-의미)).

## ⚖️ 여러 업스트림

`to`로 인스턴스를 나열하고, 트래픽을 나누는 방식을 고릅니다.

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

어느 포트가 응답했는지 알려 주는 애플리케이션으로 요청 여섯 번을 보내면 두
인스턴스가 번갈아 응답합니다.

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 동작 |
| --- | --- |
| `round_robin` | 업스트림마다 요청 하나씩, 순서대로 보냅니다. v0.2.0-rc.3의 기본값입니다. |
| `random` | 무작위로 고른 업스트림으로 보냅니다. |
| `least_conn` | 처리 중인 연결이 가장 적은 업스트림으로 보냅니다. |
| `ip_hash` | 같은 클라이언트 주소는 항상 같은 업스트림으로 갑니다. |
| `first` | 사용 가능한 첫 번째 업스트림을 고르도록 의도된 정책입니다. v0.2.0-rc.3에서는 `round_robin`처럼 동작합니다. |
| `header <name>`, `cookie <name>`, `query <name>` | 해당 필드로 해시해 세션이 한 인스턴스에 고정되게 합니다. |
| `weighted_round_robin <w> …` | 같은 줄에 업스트림마다 가중치 하나씩을 씁니다. |

**다음 릴리스**: `lb_policy`가 없으면 Caddy의 기본값처럼 업스트림을 무작위로
고릅니다. 번갈아 보내는 동작을 유지하려면 `lb_policy round_robin`을 씁니다. 또한
`first`는 실제로 사용 가능한 첫 번째 업스트림에 고정됩니다.

가중치는 업스트림마다 따로 지정할 수도 있습니다. 인스턴스마다 이유가 다를 때는 이
편이 읽기 좋습니다.

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000 {
            weight 3
        }
        to 127.0.0.1:3001
    }
}
```

⚠️ `lb_policy weighted_round_robin 3 1`은 가중치를 자신보다 위에 쓰인 업스트림에
대응시키므로, `to` 줄이 반드시 그 **앞에** 와야 합니다. 순서가 반대이면 `validate`가
`2 weights were given for 0 upstreams`로 파일을 거부합니다.

`backup`으로 표시한 업스트림은 다른 모든 업스트림을 쓸 수 없을 때만 사용됩니다.

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001 {
            backup
        }
    }
}
```

둘 다 살아 있으면 모든 요청이 `3000`으로 갑니다. 그 프로세스를 멈추면 다음 요청은
`3001`이 응답합니다.

## 🩺 헬스 체크

헬스 체크가 없으면 업스트림은 그곳으로 간 요청이 실패한 뒤에야 순환에서 빠집니다.
헬스 체크는 백그라운드에서 각 업스트림을 점검해, 실패하는 업스트림을 사용자 요청이
닿기 전에 제외합니다.

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        health_check {
            path /health
            interval 2s
            timeout 1s
            status 200
            consecutive_failure 2
            consecutive_success 1
        }
    }
}
```

애플리케이션에는 가볍게 응답하는 엔드포인트가 필요하며, 여기서는 `/health`입니다.
상태가 바뀔 때마다 로그가 남으므로, 인스턴스가 언제 순환에서 빠졌는지 여기서 알 수
있습니다.

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

이 설정으로 측정한 결과, 두 번째 인스턴스를 멈추자 모든 트래픽이 첫 번째로 갔고,
다시 살아나자 `consecutive_success`만큼 점검에 성공한 뒤 순환에 복귀했습니다.
Caddy의 평면 표기(`health_uri`, `health_interval`, `health_timeout`,
`health_status`, `health_fails`, `health_passes`)로도 같은 검사를 설정할 수
있습니다.

## ⏱️ 타임아웃

타임아웃은 `reverse_proxy` 바로 아래가 아니라 그 안의 `transport http` 블록에
씁니다.

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3099
        to 127.0.0.1:3000
        transport http {
            connect_timeout 1s
            first_byte_timeout 1s
            read_timeout 30s
            write_timeout 30s
        }
    }
}
```

측정 결과, `127.0.0.1:3099`가 아무 연결도 받지 않을 때 `connect_timeout 1s`는 1초가
걸리고, 요청은 두 번째 업스트림으로 재시도되어 `200`을 받습니다. 연결을 받은 뒤
본문을 3초 동안 기다리는 애플리케이션에는 대신 `first_byte_timeout 1s`가 적용되어
클라이언트가 `504`를 받습니다.

`dial_timeout`은 `reverse_proxy` 옵션이 아닙니다. 그 자리에 쓰면 `validate`가
`Unknown directive 'reverse_proxy: dial_timeout'`로 파일을 거부합니다.
`transport http` 안에서의 이름은 `connect_timeout`입니다.

## 🔁 호스트 이름 업스트림

업스트림은 주소 대신 호스트 이름일 수도 있습니다. 새 IP 주소로 재시작하는
컨테이너에 필요한 방식입니다.

```caddyfile
{
    dns_refresh 5s
}

http://:8080 {
    reverse_proxy {
        to api.internal:3000
    }
}
```

이름은 그 간격마다 다시 해석되며, 갱신할 때마다 로그가 남습니다.

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

`/etc/hosts`를 기준으로 측정했습니다. `api.internal`을 `127.0.0.1`로 두자 첫 번째
인스턴스가 응답했고, 파일을 `127.0.0.2`로 고치자 간격 안에 두 번째 인스턴스가
응답했습니다. 재시작도, 실패한 요청도 없었습니다. 조회에 실패하면 이전 주소가 순환에
남습니다.

## 📨 업스트림이 보는 것

애플리케이션은 원래의 `Host`와 클라이언트 주소를 일반적인 헤더로 받습니다.

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

다른 프록시 뒤에 있다면, 그 프록시가 `trusted_proxies`에 없는 한 이 헤더의 주소는
그 프록시의 주소입니다. 이 경우는
[Cloudflare Tunnel 가이드](/ko/guides/cloudflare-tunnel/)에서 다룹니다.

## ⚠️ 잘 되지 않을 때

- **프록시가 `502`를 반환합니다.** 어떤 업스트림도 응답하지 않았습니다.
  애플리케이션이 수신 중인지(`sudo ss -ltnp | grep :3000`), 주소가 맞는지
  확인합니다. **다음 릴리스**: Pingclair가 만든 `502`나 `504`에는
  `Proxy-Status: pingclair; error=…`가 붙습니다. 이 필드가 없으면 애플리케이션이
  보낸 응답입니다.
- **잠시 멈춘 뒤 `504`가 옵니다.** 타임아웃이 발생했습니다. 느린 백엔드는
  `first_byte_timeout`, 느린 본문은 `read_timeout`, 연결을 받지 않는 호스트는
  `connect_timeout`입니다.
- **`Unknown directive 'reverse_proxy: …'`.** 그 옵션은 중첩 블록에 속합니다.
  타임아웃은 `transport http` 아래, 검사는 `health_check` 아래에 두며, `validate`가
  거부한 표기를 정확히 알려 줍니다.
- **설정 변경이 반영되지 않습니다.** 리로드로는 리스너를 추가하거나 옮길 수
  없습니다. 새 파일이 그런 변경을 담고 있으면 유닛의 상태 줄에 바뀐 주소가 표시되며,
  `sudo pc service restart`로 적용합니다.
  [서비스로 실행하기](/ko/start/service/#-리로드의-의미)를 참고합니다.
- **모든 요청이 한 인스턴스로만 갑니다.** 정상인 인스턴스가 그것 하나뿐입니다.
  헬스 체크 로그에 다른 인스턴스가 언제, 왜(`ConnectRefused`,
  `failure_statuses` 등) 순환에서 빠졌는지 남아 있습니다.

## 🧭 다음 단계

- [정적 사이트 서비스하기](/ko/guides/static-site/): 압축, 캐싱, 싱글 페이지
  애플리케이션용 폴백을 다룹니다.
- [`reverse_proxy`](/ko/reference/directives/#reverse_proxy): 디렉티브
  레퍼런스입니다.
- [서비스로 실행하기](/ko/start/service/): 리로드, 재시작, 로그를 다룹니다.
