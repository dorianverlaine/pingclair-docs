---
title: アプリケーションをプロキシする
h1_emoji: '🔀'
sidebar:
  order: 1
description: アプリケーションの前に Pingclair を置き、複数のインスタンスにトラフィックを分散し、そのうち 1 つが落ちても配信を続けます。
---

リバースプロキシは、アプリケーションに手を加えずに、1 つ以上のアプリケーションインスタンスの前に 1 つの公開アドレスを置きます。このページでは 1 つのアップストリームから始めて、ヘルスチェック、タイムアウト、バックアップを備えたプールまで組み立て、最後に反対側でアプリケーションから何が見えるかを説明します。

📌 このページは最新の公開リリースである **v0.2.0-rc.3** を対象にしています。サーバーの `main` ブランチにしかない変更には **次のリリース** と記しています。

## 🧾 はじめる前に

- Pingclair がインストールされて動いていること（[インストール](/ja/start/install/)）。試している間はサービスを止めておきます：`sudo pc service stop`。
- ローカルのポートで待ち受けているアプリケーション。ここでの例では `127.0.0.1:3000` を使います。
- プロキシ自身のポート。例では `:8080` です。

## 🔀 アップストリームが 1 つの場合

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

返ってくるのはアプリケーション自身のヘッダーが付いた、アプリケーションのレスポンスです。`admin` オプションがあると `pingclair reload` が実行中のサーバーに到達できます。上の `SIGUSR1` による再読み込みは、これが無くても動きます（[再読み込みの意味](/ja/start/service/#-再読み込みの意味)）。

## ⚖️ アップストリームが複数の場合

`to` でインスタンスを並べ、トラフィックの分け方を選びます。

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

応答したポートを返すアプリケーションで試すと、6 回のリクエストが 2 つのインスタンスに交互に振り分けられます。

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 挙動 |
| --- | --- |
| `round_robin` | アップストリームごとに 1 リクエストずつ、順番に。v0.2.0-rc.3 の既定値。 |
| `random` | 無作為に選んだいずれかのアップストリーム。 |
| `least_conn` | 処理中の接続が最も少ないアップストリーム。 |
| `ip_hash` | 同じクライアントアドレスは常に同じアップストリームに届きます。 |
| `first` | 利用可能な最初のアップストリームを選ぶためのもの。v0.2.0-rc.3 では `round_robin` と同じように動作します。 |
| `header <name>`、`cookie <name>`、`query <name>` | そのフィールドでハッシュし、セッションを 1 つのインスタンスに固定します。 |
| `weighted_round_robin <w> …` | アップストリームごとに 1 つの重みを、同じ行に書きます。 |

**次のリリース：** `lb_policy` を書かない場合、アップストリームは Caddy の既定と同じく無作為に選ばれます。交互の振り分けを保つには `lb_policy round_robin` と書いてください。また、`first` は実際に利用可能な最初のアップストリームに固定されるようになります。

重みはアップストリームごとに設定することもできます。インスタンスごとに理由がある場合は、このほうが読みやすくなります。

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

⚠️ `lb_policy weighted_round_robin 3 1` は、自分より上に書かれたアップストリームに重みを対応づけるため、`to` 行はその**前**に書く必要があります。順序が逆だと、`validate` は `2 weights were given for 0 upstreams` でファイルを拒否します。

`backup` を付けたアップストリームは、他のすべてのアップストリームが利用できないときにだけ使われます。

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

両方が生きている間は、すべてのリクエストが `3000` に届きます。そのプロセスを止めると、次のリクエストには `3001` が応答します。

## 🩺 ヘルスチェック

ヘルスチェックが無い場合、アップストリームがローテーションから外れるのは、そこへのリクエストが失敗した後です。ヘルスチェックはバックグラウンドで各アップストリームを調べ、ユーザーのリクエストが届く前に異常なものを外します。

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

アプリケーションには、ここでは `/health` のような、軽く応答できるエンドポイントが必要です。状態が変わるたびにログに記録されるので、インスタンスがいつローテーションから外れたかはログで分かります。

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

この設定での実測です。2 つ目のインスタンスを止めると、すべてのトラフィックが 1 つ目に向かいました。復帰すると、`consecutive_success` 回のプローブが成功した後にローテーションに戻りました。Caddy のフラットな書き方（`health_uri`、`health_interval`、`health_timeout`、`health_status`、`health_fails`、`health_passes`）でも同じチェックを設定できます。

## ⏱️ タイムアウト

タイムアウトは `reverse_proxy` の直下ではなく、その中の `transport http` ブロックに書きます。

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

実測です。`127.0.0.1:3099` が何も受け付けない場合、`connect_timeout 1s` で 1 秒かかった後、リクエストは 2 つ目のアップストリームで再試行され、`200` が返りました。接続を受け付けた後にボディを返すまで 3 秒待つアプリケーションには、代わりに `first_byte_timeout 1s` が適用され、クライアントは `504` を受け取ります。

`dial_timeout` は `reverse_proxy` のオプションではありません。そこに書くと、`validate` は `Unknown directive 'reverse_proxy: dial_timeout'` でファイルを拒否します。`transport http` の中での名前は `connect_timeout` です。

## 🔁 ホスト名によるアップストリーム

アップストリームにはアドレスの代わりにホスト名も指定できます。新しい IP アドレスで再起動するコンテナにはこれが必要です。

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

名前はその間隔で再解決され、再解決のたびにログに記録されます。

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

`/etc/hosts` を正とした実測です。`api.internal` を `127.0.0.1` に向けると 1 つ目のインスタンスが応答し、ファイルを `127.0.0.2` に書き換えると、再起動なしで、失敗するリクエストも無く、間隔内に 2 つ目のインスタンスが応答しました。解決に失敗した場合は、以前のアドレスがローテーションに残ります。

## 📨 アップストリームから見えるもの

アプリケーションは、元の `Host` とクライアントのアドレスを通常のヘッダーで受け取ります。

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

別のプロキシの後ろでは、そのプロキシが `trusted_proxies` に含まれていない限り、これらのヘッダーのアドレスはそのプロキシのものになります。この場合は [Cloudflare Tunnel ガイド](/ja/guides/cloudflare-tunnel/)で扱っています。

## ⚠️ うまくいかないとき

- **プロキシが `502` を返す。** どのアップストリームも応答しませんでした。アプリケーションが待ち受けているか（`sudo ss -ltnp | grep :3000`）、アドレスが一致しているかを確認してください。**次のリリース：** Pingclair が生成した `502` や `504` には `Proxy-Status: pingclair; error=…` が付きます。このフィールドが無いものはアプリケーションから来たものです。
- **しばらく待った後に `504` が返る。** タイムアウトが発生しています。遅いバックエンドなら `first_byte_timeout`、遅いボディなら `read_timeout`、接続を受け付けないホストなら `connect_timeout` です。
- **`Unknown directive 'reverse_proxy: …'`。** そのオプションは入れ子のブロックに属しています。タイムアウトは `transport http`、チェックは `health_check` の下です。`validate` は拒否した綴りをそのまま示します。
- **設定の変更が反映されない。** 再読み込みではリスナーの追加や移動はできません。新しいファイルがそれを含む場合、ユニットのステータス行が変わったアドレスを示し、`sudo pc service restart` で適用されます。[サービスとして動かす](/ja/start/service/#-再読み込みの意味)を参照してください。
- **すべてのリクエストが 1 つのインスタンスに届く。** それが唯一の正常なインスタンスです。他のインスタンスがいつ、なぜ（`ConnectRefused`、`failure_statuses` など）ローテーションから外れたかは、ヘルスチェックのログに出ています。

## 🧭 次の手順

- [静的サイトを配信する](/ja/guides/static-site/)：圧縮、キャッシュ、シングルページアプリケーションのフォールバック。
- [`reverse_proxy`](/ja/reference/directives/#reverse_proxy)：ディレクティブリファレンス。
- [サービスとして動かす](/ja/start/service/)：再読み込み、再起動、ログ。
