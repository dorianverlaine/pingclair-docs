---
title: Cloudflare Tunnel 뒤에서 실행하기
h1_emoji: '☁️'
sidebar:
  order: 5
description: 오리진에 인바운드 포트를 열지 않고 Cloudflare Tunnel로 사이트를 게시하고, Pingclair 로그에 커넥터 대신 실제 클라이언트가 나오게 합니다.
---

Cloudflare Tunnel은 오리진에서 바깥으로 연결합니다. `cloudflared`가 Cloudflare에
접속하고, Cloudflare는 그 연결을 통해 요청을 되돌려 보냅니다. 공개 포트에서 수신하는
것은 없고, TLS는 엣지에서 종료되며, 오리진은 루프백에서 평문 HTTP를 받습니다. 이
페이지는 이 구성을 만든 뒤, 누구나 처음 부딪히는 문제, 즉 모든 요청이 `127.0.0.1`에서
온 것으로 기록되는 문제를 해결합니다.

📌 이 페이지는 최신 공개 릴리스인 Pingclair **v0.2.0-rc.3**을 설명합니다.

## 🧾 시작하기 전에

- Cloudflare 계정에 등록되어 Zero Trust를 쓸 수 있는 도메인이 필요합니다.
- Pingclair와 같은 호스트에 `cloudflared`가 있고, Pingclair가 사이트를 서비스하고
  있어야 합니다([정적 사이트 서비스하기](/ko/guides/static-site/)).
- 대시보드(Zero Trust → Networks → Tunnels)나, 해당 존에 대해
  **Cloudflare Tunnel: Write**와 **DNS: Edit** 권한을 가진 API 토큰 중 하나가
  필요합니다. 여기서는 API를 쓰며, `$CF_TOKEN`, `$ACCOUNT`, `$ZONE`에 각각 토큰,
  계정 ID, 존 ID를 넣어 둡니다.

## 🌐 터널 만들기

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare`는 터널을 **원격으로 관리**한다는 뜻입니다. 인그레스 규칙은
Cloudflare에 있고 API로 전달되므로 커넥터 옆에 따로 적어 둘 것이 없습니다.

커넥터 자격 증명은 별도 호출로 받습니다.

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

이 토큰은 비밀 정보입니다. 어떤 호스트든 이 토큰으로 터널에 합류할 수 있습니다.
비밀번호처럼 다루고, 유출되면 교체합니다.

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

커넥터는 가까운 Cloudflare 거점 네 곳에 연결을 열며, 기본으로 QUIC을 씁니다.

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 호스트 이름 라우팅하기

인그레스 규칙은 어떤 호스트 이름이 어떤 오리진 서비스로 갈지 정합니다.

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

마지막 규칙은 나머지를 모두 받는 규칙입니다. 다른 호스트 이름의 요청은 오리진에
닿지 않고 `404`를 받습니다.

그런 다음 프록시를 켠 채로 이름이 터널을 가리키게 합니다.

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

어디서든 확인합니다.

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare`는 엣지가 응답했다는 뜻입니다. 오리진에는 터널을 통해 도달했고,
이를 위해 인바운드 포트를 열지 않았습니다.

## 🎯 오리진이 클라이언트를 보게 하기

모든 요청이 루프백의 커넥터에서 들어오므로, 기본적으로 액세스 로그에는 클라이언트가
아니라 커넥터가 기록됩니다.

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies`는 포워딩 헤더로 클라이언트 주소를 알려도 되는 피어를 나열합니다.
커넥터가 같은 호스트에서 실행되므로 루프백만 적으면 됩니다.

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

옵션을 넣기 전과 후에 같은 요청으로 측정한 결과입니다.

```text
remote_ip=127.0.0.1          # before
remote_ip=16.162.199.171     # after: the client that started the request
```

터널 뒤에서 클라이언트별 속도 제한과 `client_ip` 매처가 실제 클라이언트를 보게 하는
것도 이 설정입니다. 시작할 때 읽히므로 바꾸려면 리로드가 아니라 재시작이 필요합니다
([리로드의 의미](/ko/start/service/#-리로드의-의미)).

**다음 릴리스**: `remote_ip` 매처는 연결 자체의 피어와 일치하며, 터널 뒤에서는 항상
커넥터입니다. 클라이언트와 일치시키려면 `client_ip`를 씁니다. v0.2.0-rc.3에서는 두
매처 모두 포워딩된 클라이언트를 봅니다.

## ⚠️ 잘 되지 않을 때

- **`error code: 1033`과 함께 `HTTP/2 530`.** 터널에 커넥터가 없습니다. 오리진에서
  `systemctl is-active cloudflared`로 실행 여부를 확인합니다. 커넥터가 등록되면 몇 초
  안에 요청이 다시 `200`으로 응답합니다.
- **요청이 다른 사이트로 가거나 `404`가 납니다.** 인그레스 규칙은 순서대로 일치하며
  나머지를 받는 규칙으로 끝납니다. DNS를 의심하기 전에 규칙의 호스트 이름 철자를
  확인합니다.
- **엣지가 `502`를 반환합니다.** 커넥터는 동작하지만 오리진 서비스가 연결을
  거부했습니다. 규칙이 지정한 포트에서 Pingclair가 수신하고 있지 않습니다.
- **액세스 로그가 항상 `127.0.0.1`입니다.** 위에서처럼 `trusted_proxies`가
  빠졌습니다.
- **호스트 이름이 해석되지 않습니다.** 레코드는 `<tunnel-id>.cfargotunnel.com`을
  가리키는, 프록시가 켜진 CNAME이어야 합니다. 회색 구름(프록시 꺼짐) 레코드는 터널을
  완전히 우회합니다.
- **커넥터 토큰이 유출되었습니다.** 터널의 토큰을 교체하고 새 토큰으로 서비스를 다시
  설치합니다.

## 🧭 다음 단계

- [정적 사이트 서비스하기](/ko/guides/static-site/): 이 예시들이 가리키는
  오리진입니다.
- [TLS에서 조정할 수 있는 것](/ko/guides/tls-tuning/): 엣지가 TLS를 종료하지 않을 때
  오리진이 인증서로 할 수 있는 것입니다.
- [서비스로 실행하기](/ko/start/service/): 오리진의 유닛과, `trusted_proxies` 설명에서
  언급한 리로드 방식입니다.
