---
title: アプリケーションをプロキシする
h1_emoji: '🔀'
sidebar:
  order: 1
description: Pingclair をアプリケーションの前に置き、複数インスタンスへ負荷を分散し、1 台が落ちても配信を続けます。
---

リバースプロキシは、多くの人が最初に求める構成です。公開アドレスが 1 つ、その
背後にアプリケーションのインスタンスが 1 つ以上、アプリケーション側の変更は
不要。このページは、単一のアムトからヘルスチェック、タイムアウト、バックアップを
備えたプールまでを組み立て、反対側からアプリケーションが何を見るかを示します。

## 🧾 はじめる前に

- Pingclair が導入され動いていること（[インストール](/ja/start/install/)）。実験中は
  サービスを停止します: `sudo pc service stop`。
- ローカルポートで待ち受けているアプリケーション。例では `127.0.0.1:3000` を
  使います。
- プロキシ自身のポート。例では `:8080`。

## 🔀 アムトが 1 つ

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

応答はアプリケーションのもので、そのヘッダーもそのまま通ります。`admin` は
`pingclair reload` が実行中のサーバーに届くようにするためで、`SIGUSR1` には
不要です（[再読み込みの意味](/ja/start/service/#-what-a-reload-means)）。

## ⚖️ アムトが複数

`to` でインスタンスを並べ、そのあと分散方法を選びます。

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

生きている 2 台への 6 リクエストは交互になります。どのポートが答えたかを返す
アプリケーションでの実測:

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 動作 |
| --- | --- |
| `round_robin` | 順番に 1 リクエストずつ。既定値。 |
| `random` | ランダムなアムト。 |
| `least_conn` | 進行中の接続が最も少ないアムト。 |
| `ip_hash` | 同じクライアントアドレスは常に同じアムトへ。 |
| `first` | 利用可能な最初のアムト。 |
| `header <名前>`, `cookie <名前>`, `query <名前>` | そのフィールドでハッシュし、セッションを 1 台に固定。 |
| `weighted_round_robin <重み> …` | 同じ行にアムトごとの重み。 |

重みはアムトごとにも書けます。理由が台ごとに違うときはこちらのほうが読みやすく
なります。

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

⚠️ `lb_policy weighted_round_robin 3 1` は既に書かれたアムトを数えるので、`to` 行は
**先**に置く必要があります。逆順に書くと `validate` が
`2 weights were given for 0 upstreams` で拒否します。

`backup` を付けたアムトは、他のすべてが利用できないときにだけ使われます。

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

両方が生きていると、すべてのリクエストは `3000` へ。そのプロセスを止めると、
次のリクエストは `3001` が返します。

## 🩺 ヘルスチェック

チェックが無い場合、アムトはリクエストが失敗して初めて外れます。チェックがあれば
先に外れます。

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

アプリケーションには安価に答えるエンドポイントが必要です（ここでは `/health`）。
状態の変化はログに残るので、なぜ回転から外れたかが分かります。

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

この構成での実測: 2 台目を落とすと全トラフィックが 1 台目へ、戻すと
`consecutive_success` 回の成功のあとに回転へ復帰しました。実際の Caddyfile が
使う平坦な綴り（`health_uri`、`health_interval`、`health_timeout`、
`health_status`、`health_fails`、`health_passes`）も同じチェックを設定します。

## ⏱️ タイムアウト

タイムアウトは `reverse_proxy` の直下ではなく、その中の `transport http` ブロックに
置きます。

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

実測: `127.0.0.1:3099` が何も受け付けない場合、`connect_timeout 1s` で 1 秒を
費やし、リクエストは 2 台目のアムトに再試行されて `200` が返ります。接続だけ
受け付けて本文を 3 秒待つアプリケーションには `first_byte_timeout 1s` が効き、
クライアントは `504` を受け取ります。

`dial_timeout` は `reverse_proxy` のオプションではありません。そこに書くと
`validate` が `Unknown directive 'reverse_proxy: dial_timeout'` で拒否します。
`transport http` の中での名前は `connect_timeout` です。

## 🔁 名前で指定するアムト

アムトはアドレスではなく名前でも指定できます。新しい IP で再起動する
コンテナが必要とする形です。

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

名前はその間隔で再解決され、変更はログに残ります。

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

`/etc/hosts` を唯一の情報源とした実測: `api.internal` を `127.0.0.1` に向けると
1 台目が応答し、`127.0.0.2` に書き換えると間隔内に 2 台目が応答しました。再起動も
失敗したリクエストもありません。解決に失敗した場合は前のアドレスが回転に残ります。

## 📨 アムトが見るもの

アプリケーションは元の `Host` と、いつものヘッダーに入ったクライアントの
アドレスを受け取ります。

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

別のプロキシの背後では、そのプロキシが `trusted_proxies` に含まれない限り、
これらのヘッダーのアドレスはそのプロキシのものです
（[Cloudflare Tunnel ガイド](/ja/guides/cloudflare-tunnel/)）。

## ⚠️ うまくいかないとき

- **プロキシからの `502`。** どのアムトも応答していません。アプリケーションが
  待ち受けているか（`sudo ss -ltnp | grep :3000`）とアドレスの一致を確認します。
- **間を置いた `504`。** タイムアウトが発火しています。遅いバックエンドなら
  `first_byte_timeout`、遅い本文なら `read_timeout`、決して受け付けない相手なら
  `connect_timeout` です。
- **`Unknown directive 'reverse_proxy: …'`。** そのオプションは入れ子のブロックに
  属します（タイムアウトは `transport http`、チェックは `health_check`）。
  `validate` は拒否した綴りをそのまま示します。
- **設定変更が反映されない。** 再読み込みが適用するのはポリシーで、新しい
  リスナーではありません。`pc service reload` は何も適用しません
  （[サービスとして動かす](/ja/start/service/#-what-a-reload-means)）。
- **すべてのリクエストが 1 台に届く。** それが唯一の健全なアムトです。ヘルス
  チェックのログが、いつ何の理由で他が外れたかを示します（`ConnectRefused`、
  `failure_statuses` など）。

## 🧭 次の手順

- [静的サイトを配信する](/ja/guides/static-site/): 圧縮、キャッシュ、シングル
  ページアプリケーションのフォールバック。
- [`reverse_proxy`](/ja/reference/directives/#reverse_proxy): ディレクティブの
  リファレンス。
- [サービスとして動かす](/ja/start/service/): 再読み込み、再起動、ログ。
