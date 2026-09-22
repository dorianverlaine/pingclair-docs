---
title: Cloudflare Tunnel 뒤에서 실행
h1_emoji: '☁️'
sidebar:
  order: 5
description: Cloudflare Tunnel로 사이트를 공개해 오리진에 인바운드 포트가 필요 없게 하고, Pingclair 로그에 커넥터가 아니라 실제 클라이언트를 남깁니다.
---

Cloudflare Tunnel은 오리진을 바깥으로 연결합니다. `cloudflared`가 Cloudflare로
다이얼하고, Cloudflare는 그 연결로 요청을 돌려보냅니다. 공개 포트에서 듣는 것이
없고, 에지가 TLS를 종료하며, 오리진은 루프백에서 평문 HTTP를 봅니다. 이 페이지는
그것을 설정하고, 늘 먼저 걸리는 한 가지 — 모든 요청이 `127.0.0.1`로 기록되는 것 —
을 고칩니다.

## 🧾 시작하기 전에

- 도메인이 Cloudflare 계정에 있고 Zero Trust를 쓸 수 있어야 합니다.
- Pingclair와 같은 호스트에 `cloudflared`, 그리고 사이트를 서비스하는 Pingclair
  ([정적 사이트 서비스](/ko/guides/static-site/)).
- 대시보드(Zero Trust → Networks → Tunnels) 또는 **Cloudflare Tunnel: Write**와
  존의 **DNS: Edit** 권한이 있는 API 토큰. 예제는 API를 쓰며 `$CF_TOKEN`,
  `$ACCOUNT`, `$ZONE`을 설정합니다.

## 🌐 터널 만들기

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare`는 터널을 **원격 관리**로 만듭니다. ingress 규칙이
Cloudflare에 있고 API로 밀어 넣어지므로 커넥터 옆에 무엇을 쓸 필요가 없습니다.

커넥터 자격 증명은 별도 호출입니다.

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

이 토큰은 비밀이며 호스트를 터널에 참여시키는 열쇠입니다. 비밀번호처럼 다루고
유출되면 교체하십시오.

## 🔌 호스트 연결하기

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install "$TUNNEL_TOKEN"
```

```text
INF Linux service for cloudflared installed successfully
```

커넥터는 가장 가까운 Cloudflare 위치로 네 개의 연결을 등록하고 기본으로 QUIC을
씁니다.

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 호스트 이름 연결하기

ingress 규칙이 어느 호스트 이름이 어느 오리진 서비스로 가는지 정합니다.

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

마지막 규칙은 받아내는 규칙입니다. 다른 호스트 이름은 기본 사이트가 아니라 `404`를
받습니다.

그다음 이름을 터널로 향하게 합니다. 프록시는 켜 둡니다.

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

어디서든:

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare`는 에지가 응답했다는 표시입니다. 오리진에는 터널로 도달했고
어떤 포트도 열지 않았습니다.

## 🎯 오리진이 클라이언트를 보게 하기

기본적으로 모든 요청은 커넥터에서 루프백으로 도착합니다. 액세스 로그는 클라이언트가
누구였는지 아무것도 말해 주지 않습니다.

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies`는 어떤 피어가 클라이언트 주소를 주장할 수 있는지 Pingclair에
알려 줍니다. 커넥터가 같은 호스트에서 돌므로 루프백이면 충분합니다.

```caddyfile
{
    admin 127.0.0.1:2019
    trusted_proxies 127.0.0.1/32
}

http://:80 {
    root * /srv/site
    file_server
}
```

옵션 전후로 같은 요청을 측정:

```text
remote_ip=127.0.0.1          # 전
remote_ip=16.162.199.171     # 후: 요청을 시작한 클라이언트
```

이 설정은 터널 뒤에서 IP 단위 제한과 규칙을 의미 있게 만드는 것이기도 합니다.
시작 시 확립되므로 변경에는 재적용이 아니라 재시작이 필요합니다
([재적용의 의미](/ko/start/service/#-재적용의-의미)).

## ⚠️ 잘 되지 않을 때

- **`HTTP/2 530`과 `error code: 1033`.** 터널에 커넥터가 없습니다. 오리진의
  `systemctl is-active cloudflared`가 상태를 알려 주고, 커넥터가 등록되면 몇 초
  안에 다시 `200`이 됩니다.
- **다른 사이트로 가거나 `404`.** ingress 규칙은 순서대로 평가되고 마지막이
  받아내는 규칙입니다. DNS를 의심하기 전에 규칙 안의 호스트 이름 철자를 보십시오.
- **에지에서 `502`.** 커넥터는 살아 있지만 오리진 서비스가 연결을 거부했습니다.
  규칙이 가리키는 포트에서 Pingclair가 듣고 있지 않습니다.
- **액세스 로그가 늘 `127.0.0.1`.** 위에서 말한 `trusted_proxies`가 없습니다.
- **호스트 이름이 해석되지 않음.** 레코드는 `<tunnel-id>.cfargotunnel.com`으로 가는
  프록시된 CNAME여야 합니다. 회색 구름 레코드는 터널을 우회합니다.
- **커넥터 토큰이 유출됨.** 터널의 토큰을 삭제하고 새 것으로 서비스를 다시
  설치하십시오. 옛 자격 증명은 API로 되찾을 수 없습니다.

## 🧭 다음 단계

- [정적 사이트 서비스](/ko/guides/static-site/): 이 예제가 가리키는 오리진.
- [TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/): 에지가 종료하지 않을 때
  오리진이 인증서로 할 수 있는 일.
- [서비스로 실행](/ko/start/service/): 오리진의 유닛과 `trusted_proxies` 주의가
  가리키는 재적용 의미.
