---
title: 애플리케이션 프록시하기
h1_emoji: '🔀'
sidebar:
  order: 1
description: Pingclair를 애플리케이션 앞에 두고, 여러 인스턴스로 트래픽을 나누고, 하나가 죽어도 계속 서비스합니다.
---

리버스 프록시는 대부분의 사람이 처음 찾는 구성입니다. 공개 주소 하나, 그 뒤에
애플리케이션 인스턴스 하나 이상, 애플리케이션은 손대지 않습니다. 이 페이지는 단일
업스트림에서 시작해 헬스 체크, 타임아웃, 백업을 갖춘 풀까지 만들어 보고, 반대편에서
애플리케이션이 무엇을 보는지 보여 줍니다.

## 🧾 시작하기 전에

- Pingclair가 설치되어 실행 중이어야 합니다([설치](/ko/start/install/)). 실험하는
  동안에는 서비스를 멈춥니다: `sudo pc service stop`.
- 로컬 포트에서 듣는 애플리케이션. 예제는 `127.0.0.1:3000`을 씁니다.
- 프록시 자신의 포트. 예제는 `:8080`.

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

응답은 애플리케이션의 것이고 그 헤더도 그대로 전달됩니다. `admin`은
`pingclair reload`가 실행 중인 서버에 닿기 위한 것이며 `SIGUSR1`에는 필요하지
않습니다([재적용의 의미](/ko/start/service/#-what-a-reload-means)).

## ⚖️ 업스트림 여러 개

`to`로 인스턴스를 나열하고 분배 방식을 고릅니다.

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

살아 있는 두 대로 간 6번의 요청은 번갈아 갑니다. 어느 포트가 응답했는지 알려 주는
애플리케이션으로 측정한 값입니다.

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 동작 |
| --- | --- |
| `round_robin` | 순서대로 업스트림마다 하나씩. 기본값. |
| `random` | 임의의 업스트림. |
| `least_conn` | 진행 중인 연결이 가장 적은 업스트림. |
| `ip_hash` | 같은 클라이언트 주소는 항상 같은 업스트림으로. |
| `first` | 사용 가능한 첫 업스트림. |
| `header <이름>`, `cookie <이름>`, `query <이름>` | 그 필드로 해시해 세션을 한 인스턴스에 고정. |
| `weighted_round_robin <가중치> …` | 같은 줄에 업스트림별 가중치. |

가중치는 업스트림마다 쓸 수도 있습니다. 이유가 인스턴스마다 다를 때 더 읽기
좋습니다.

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

⚠️ `lb_policy weighted_round_robin 3 1`은 이미 쓰인 업스트림을 세므로 `to` 줄이
**먼저** 와야 합니다. 순서를 뒤집으면 `validate`가
`2 weights were given for 0 upstreams`로 거부합니다.

`backup`으로 표시한 업스트림은 다른 모든 업스트림을 쓸 수 없을 때만 쓰입니다.

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

체크가 없으면 업스트림은 요청이 실패한 뒤에야 빠집니다. 체크가 있으면 먼저
빠집니다.

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

애플리케이션에는 값싸게 응답하는 엔드포인트가 필요합니다(여기서는 `/health`).
상태 변화는 로그에 남으므로 왜 로테이션에서 빠졌는지 알 수 있습니다.

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

이 구성에서 측정: 두 번째 인스턴스를 죽이면 모든 트래픽이 첫 번째로 갔고, 되살리면
`consecutive_success`번의 성공 뒤에 로테이션으로 돌아왔습니다. 실제 Caddyfile이 쓰는
평평한 표기(`health_uri`, `health_interval`, `health_timeout`, `health_status`,
`health_fails`, `health_passes`)도 같은 체크를 설정합니다.

## ⏱️ 타임아웃

타임아웃은 `reverse_proxy` 바로 아래가 아니라 그 안의 `transport http` 블록에
있습니다.

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

측정: `127.0.0.1:3099`가 아무것도 받지 않으면 `connect_timeout 1s`로 1초를 쓰고
요청은 두 번째 업스트림으로 재시도되어 `200`을 받습니다. 연결만 받고 본문을 3초
기다리는 애플리케이션에는 `first_byte_timeout 1s`가 적용되어 클라이언트는 `504`를
받습니다.

`dial_timeout`은 `reverse_proxy`의 옵션이 아닙니다. 거기 쓰면 `validate`가
`Unknown directive 'reverse_proxy: dial_timeout'`으로 거부합니다. `transport http`
안에서의 이름은 `connect_timeout`입니다.

## 🔁 이름으로 지정하는 업스트림

업스트림은 주소 대신 이름일 수 있습니다. 새 IP로 다시 뜨는 컨테이너에 필요한
형태입니다.

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

그 간격마다 이름을 다시 해석하고, 변경은 로그에 남습니다.

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

`/etc/hosts`를 유일한 정보원으로 한 측정: `api.internal`을 `127.0.0.1`로 두면 첫
인스턴스가 응답했고, `127.0.0.2`로 고치면 간격 안에 두 번째가 응답했습니다. 재시작도
실패한 요청도 없었습니다. 해석에 실패하면 이전 주소가 로테이션에 남습니다.

## 📨 업스트림이 보는 것

애플리케이션은 원래의 `Host`와 늘 쓰는 헤더에 담긴 클라이언트 주소를 받습니다.

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

다른 프록시 뒤에서는 그 프록시가 `trusted_proxies`에 없으면 이 헤더의 주소는 그
프록시의 것입니다([Cloudflare Tunnel 가이드](/ko/guides/cloudflare-tunnel/)).

## ⚠️ 잘 되지 않을 때

- **프록시의 `502`.** 어떤 업스트림도 응답하지 않았습니다. 애플리케이션이 듣고
  있는지(`sudo ss -ltnp | grep :3000`)와 주소가 맞는지 확인하십시오.
- **잠시 뒤 `504`.** 타임아웃이 걸렸습니다. 느린 백엔드면 `first_byte_timeout`,
  느린 본문이면 `read_timeout`, 결코 받지 않는 상대면 `connect_timeout`입니다.
- **`Unknown directive 'reverse_proxy: …'`.** 그 옵션은 중첩 블록에 속합니다
  (타임아웃은 `transport http`, 체크는 `health_check`). `validate`가 거부한 철자를
  그대로 알려 줍니다.
- **설정 변경이 반영되지 않음.** 재적용이 적용하는 것은 정책이지 새 리스너가
  아니며, `pc service reload`는 아무것도 적용하지 않습니다
  ([서비스로 실행](/ko/start/service/#-what-a-reload-means)).
- **모든 요청이 한 인스턴스로 감.** 그것이 유일하게 건강한 업스트림입니다. 헬스
  체크 로그가 언제 어떤 이유로 나머지가 빠졌는지 알려 줍니다(`ConnectRefused`,
  `failure_statuses` 등).

## 🧭 다음 단계

- [정적 사이트 서비스](/ko/guides/static-site/): 압축, 캐시, 단일 페이지
  애플리케이션 폴백.
- [`reverse_proxy`](/ko/reference/directives/#reverse_proxy): 지시어 레퍼런스.
- [서비스로 실행](/ko/start/service/): 재적용, 재시작, 로그.
