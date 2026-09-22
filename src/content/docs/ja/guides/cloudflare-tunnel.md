---
title: Cloudflare Tunnel の背後で動かす
h1_emoji: '☁️'
sidebar:
  order: 5
description: Cloudflare Tunnel でサイトを公開し、オリジンに受信ポートを不要にし、Pingclair のログに接続子ではなく本当のクライアントを出すようにします。
---

Cloudflare Tunnel はオリジンを外側へ接続します。`cloudflared` が Cloudflare へ
ダイヤルし、Cloudflare はその接続を通して要求を返します。公開ポートで待ち受ける
ものはなく、エッジが TLS を終端し、オリジンはループバックで平文 HTTP を見ます。
このページはそれを設定し、最初に必ずつまずく一点――すべての要求が
`127.0.0.1` として記録される――を直します。

## 🧾 はじめる前に

- そのドメインが Cloudflare アカウントにあり、Zero Trust が使えること。
- Pingclair と同じホストに `cloudflared`、そしてサイトを配信する Pingclair
  （[静的サイトを配信する](/ja/guides/static-site/)）。
- ダッシュボード（Zero Trust → Networks → Tunnels）か、**Cloudflare Tunnel:
  Write** とゾーンの **DNS: Edit** を持つ API トークン。例では API を使い、
  `$CF_TOKEN`、`$ACCOUNT`、`$ZONE` を設定します。

## 🌐 トンネルを作る

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` はトンネルを**リモート管理**にします。ingress ルールは
Cloudflare 側にあり API で投入されるので、接続子の隣に何かを書く必要はありません。

接続子の資格情報は別の呼び出しです。

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

このトークンは秘密情報で、ホストをトンネルに参加させる鍵です。パスワードと同様に
扱い、漏れたら交換してください。

## 🔌 ホストを接続する

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install "$TUNNEL_TOKEN"
```

```text
INF Linux service for cloudflared installed successfully
```

接続子は最寄りの Cloudflare 拠点へ 4 本の接続を登録し、既定で QUIC を使います。

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 ホスト名を経路にする

ingress ルールが、どのホスト名をどのオリジンサービスへ送るかを決めます。

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.aqeo.dev","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

最後のルールは受け皿です。他のホスト名は既定のサイトではなく `404` になります。

次に、その名前をトンネルへ向けます。プロキシは有効にします。

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.aqeo.dev","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

どこからでも:

```bash
curl -I https://tunnel-test.aqeo.dev/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` はエッジが応答している印です。オリジンへはトンネル経由で
到達しており、どのポートも開いていません。

## 🎯 オリジンにクライアントを見せる

既定では、すべての要求が接続子からループバック経由で届きます。アクセスログは
クライアントが誰かを何も語りません。

```text
📝 Access … host="tunnel-test.aqeo.dev" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` は、どの相手がクライアントアドレスを主張してよいかを Pingclair に
伝えます。接続子は同じホストで動くので、ループバックだけで足ります。

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

オプションの前後で同じ要求を測った結果:

```text
remote_ip=127.0.0.1          # 前
remote_ip=16.162.199.171     # 後: 要求を始めたクライアント
```

この設定は、トンネルの背後で IP 単位の制限やルールを意味のあるものにするものでも
あります。起動時に確立されるため、変更には再読み込みではなく再起動が要ります
（[再読み込みの意味](/ja/start/service/#-what-a-reload-means)）。

## ⚠️ うまくいかないとき

- **`HTTP/2 530` と `error code: 1033`。** トンネルに接続子がありません。
  オリジン側の `systemctl is-active cloudflared` が状態を示し、接続子が登録され
  れば数秒で `200` に戻ります。
- **別のサイトに届く、または `404`。** ingress ルールは順に評価され、最後は受け皿
  です。DNS を疑う前にルール内のホスト名の綴りを確認します。
- **エッジからの `502`。** 接続子は生きていますが、オリジンサービスが接続を拒否
  しました。ルールが指すポートで Pingclair が待ち受けていません。
- **アクセスログが常に `127.0.0.1`。** 上記のとおり `trusted_proxies` が
  ありません。
- **ホスト名が解決しない。** レコードは `<tunnel-id>.cfargotunnel.com` への
  プロキシされた CNAME である必要があります。グレー雲のレコードはトンネルを
  迂回します。
- **接続子トークンが漏れた。** トンネルのトークンを削除し、新しいものでサービスを
  入れ直します。古い資格情報は API から取り戻せません。

## 🧭 次の手順

- [静的サイトを配信する](/ja/guides/static-site/): この例が指すオリジン。
- [TLS で調整できること](/ja/guides/tls-tuning/): エッジが終端しないとき、
  オリジンが証明書でできること。
- [サービスとして動かす](/ja/start/service/): オリジン側のユニットと、
  `trusted_proxies` の注意が参照する再読み込みの意味。
