---
title: Cloudflare Tunnel の背後で動かす
h1_emoji: '☁️'
sidebar:
  order: 5
description: Cloudflare Tunnel でサイトを公開してオリジンの受信ポートを不要にし、Pingclair のログにコネクターではなく実際のクライアントが記録されるようにします。
---

Cloudflare Tunnel は、オリジンから外側へ接続します。`cloudflared` が Cloudflare に接続し、Cloudflare はその接続を通してリクエストを送り返します。公開ポートで待ち受けるものは無く、TLS はエッジで終端され、オリジンはループバック上で平文の HTTP を受け取ります。このページではこの構成を設定し、誰もが最初にぶつかる問題、つまりすべてのリクエストが `127.0.0.1` からのものとして記録される問題を解決します。

📌 このページは最新の公開リリースである Pingclair **v0.2.0-rc.3** を対象にしています。

## 🧾 はじめる前に

- Cloudflare アカウントにドメインがあり、Zero Trust が使えること。
- Pingclair と同じホスト上の `cloudflared`、そしてサイトを配信している Pingclair（[静的サイトを配信する](/ja/guides/static-site/)）。
- ダッシュボード（Zero Trust → Networks → Tunnels）、またはそのゾーンに対する **Cloudflare Tunnel: Write** と **DNS: Edit** の権限を持つ API トークン。ここでの例は API を使い、`$CF_TOKEN`、`$ACCOUNT`、`$ZONE` にそれぞれトークン、アカウント ID、ゾーン ID を設定しています。

## 🌐 トンネルを作る

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` は、トンネルが**リモート管理**であることを意味します。イングレスルールは Cloudflare 側にあって API を通じて配信されるため、コネクターの隣に何かを書く必要はありません。

コネクターの認証情報は別の呼び出しで取得します。

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

このトークンは秘密情報です。どのホストでもこれを使ってトンネルに参加できます。パスワードと同じように扱い、漏れた場合はローテーションしてください。

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

コネクターは近くの Cloudflare の拠点に向けて 4 本の接続を開きます。既定では QUIC を使います。

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 ホスト名をルーティングする

どのホスト名をどのオリジンサービスに届けるかは、イングレスルールで決まります。

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

最後のルールはキャッチオールです。それ以外のホスト名へのリクエストは、オリジンに届かずに `404` を受け取ります。

次に、プロキシを有効にした状態で、名前をトンネルに向けます。

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

どこからでも確認できます。

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` は、エッジが応答していることを示しています。オリジンにはトンネルを通じて到達しており、そのための受信ポートは開いていません。

## 🎯 オリジンからクライアントを見えるようにする

すべてのリクエストはループバック上のコネクターから届くため、既定ではアクセスログにクライアントではなくコネクターが記録されます。

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` には、転送ヘッダーでクライアントのアドレスを伝えることを許すピアを並べます。コネクターは同じホスト上で動いているので、一覧はループバックだけで足ります。

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

同じリクエストを、オプションの追加前と追加後に測定した結果です。

```text
remote_ip=127.0.0.1          # before
remote_ip=16.162.199.171     # after: the client that started the request
```

トンネルの背後でも、クライアント単位のレート制限や `client_ip` マッチャーが実際のクライアントを認識できるのは、この設定のおかげです。この設定は起動時に読まれるため、変更には再読み込みではなく再起動が必要です（[再読み込みの意味](/ja/start/service/#-再読み込みの意味)）。

**次のリリース：** `remote_ip` マッチャーは接続そのもののピアにマッチするようになり、トンネルの背後では常にコネクターになります。クライアントにマッチさせるには `client_ip` を使ってください。v0.2.0-rc.3 では、どちらのマッチャーも転送されたクライアントを参照します。

## ⚠️ うまくいかないとき

- **`HTTP/2 530` と `error code: 1033`。** トンネルにコネクターがありません。オリジンで `systemctl is-active cloudflared` を実行すると、動いているかどうかが分かります。コネクターが登録されると、数秒のうちにリクエストは再び `200` を返します。
- **リクエストが別のサイトに届く、または `404` になる。** イングレスルールは順番に照合され、最後はキャッチオールです。DNS を疑う前に、ルールのホスト名の綴りを確認してください。
- **エッジから `502` が返る。** コネクターは動いていますが、オリジンサービスが接続を拒否しました。ルールに書いたポートで Pingclair が待ち受けていません。
- **アクセスログが常に `127.0.0.1` を示す。** 上で説明したとおり、`trusted_proxies` がありません。
- **ホスト名が解決されない。** レコードは `<tunnel-id>.cfargotunnel.com` へのプロキシ有効な CNAME である必要があります。グレークラウドのレコードは、トンネルを完全に迂回します。
- **コネクターのトークンが漏れた。** トンネルのトークンをローテーションし、新しいトークンでサービスをインストールし直してください。

## 🧭 次の手順

- [静的サイトを配信する](/ja/guides/static-site/)：これらの例が指しているオリジン。
- [TLS で調整できること](/ja/guides/tls-tuning/)：エッジが TLS を終端しない場合に、オリジンが証明書でできること。
- [サービスとして動かす](/ja/start/service/)：オリジン上のユニットと、`trusted_proxies` の注記が参照している再読み込みの意味。
