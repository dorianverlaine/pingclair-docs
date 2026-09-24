---
title: HTTP/3 を配信する
h1_emoji: '⚡'
sidebar:
  order: 4
description: HTTP/3 を有効にし、クライアントが本当にそれを使ったことを確かめ、QUIC 上で挙動が変わるリクエストを把握します。
---

HTTP/3 は既定で有効です。グローバルのプロトコル一覧から `h3` を外さない限り、HTTPS サイトには UDP 443 の QUIC リスナーが用意されます。注意が必要なのは、クライアントが本当に HTTP/3 を使ったと確かめる部分です。黙って HTTP/2 にフォールバックしたクライアントは、成功とまったく同じに見えるからです。

📌 このページは最新の公開リリースである **v0.2.0-rc.3** を対象にしています。サーバーの `main` ブランチにしかない変更には **次のリリース** と記しています。

## 🧾 はじめる前に

- ホストに解決される名前と、その証明書（[HTTPS](/ja/start/https/)）。
- プロバイダーとホストの両方のファイアウォールで **UDP 443 が開いていること**。QUIC にはフォールバックがありません。UDP が塞がれていると、クライアントは HTTP/2 を使い、そのことを何も知らせません。
- HTTP/3 に対応したクライアント。ほとんどのディストリビューションのシステム `curl` は対応していません。それでも要求すると、はっきりそう伝えてきます。

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 有効にする

```caddyfile
{
    email bonjour@pingclair.com
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

サイトを動かした状態で、ホスト上で測定した結果です。

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

一覧から `h3` を外すと、このリスナーは無くなります。一覧がスイッチの役割を果たします（[TLS で調整できること](/ja/guides/tls-tuning/#-どのプロトコルを配信するか)）。`protocols` 行が無い場合、HTTP/3 は有効のままです。

`tls` ブロックはサイト単位のスイッチも受け付けます。

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

⚠️ v0.2.0-rc.3 では、`http3 off` は受け付けられるものの効果がありません。サイトは引き続き QUIC で配信されます。**次のリリース：** リスナーが他のサイトを配信し続ける一方で、そのサイトは QUIC から外れ、そのレスポンスは `Alt-Svc` で HTTP/3 を告知しなくなります。

## ✅ クライアントが使ったことを示す

証拠はクライアント側から得ます。ngtcp2 または quiche でビルドされた curl なら何でも使えます。curl が HTTP/3 に対応していないホストでは、コンテナを使うのが最も手早い方法です。

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

`--network host` を付けると、コンテナはホストのネットワークを直接使います。付けないと、リクエストが QUIC を遮断するネットワーク名前空間を通る場合があります。

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

答えは 1 行目にあります。ステータス行が `HTTP/2` ではなく `HTTP/3` になっています。同じ URL を `--http2` と `--http1.1` で要求すると残りの 2 つのプロトコルが表示され、クライアントがフォールバックしていないことを確認できます。

コンテナが使えない場合でも、システムの OpenSSL が 3.5 以降であれば、QUIC のハンドシェイクを確認できます。

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

検証済みのチェーンとともに `ALPN protocol: h3` が表示されれば、QUIC リスナーがその名前に対して、クライアントの信頼する証明書で応答していることの証明になります。ただし、完全な HTTP/3 リクエストが動作することまでは証明しません。それを確かめるのは curl による確認です。

## 🧭 HTTP/3 で異なること

HTTP/3 はポリシーのコードを HTTP/1.1 および HTTP/2 と共有しているため、ルーティング、マッチャー、ヘッダー、レート制限、FastCGI、アクセスログは同じように動作します。違いが出るのは、HTTP/3 では運べないものがある箇所です。

| 領域 | HTTP/3 での挙動 |
| --- | --- |
| 宣言されたリクエストトレーラー | どのプロトコルでも転送しません。レスポンスの確定前なら `501` を返し、HTTP/3 では確定後にストリームをリセットします。 |
| アップストリームのレスポンストレーラー | どのプロトコルでも `502`。 |
| `CONNECT` | Pingclair はトンネルを開きません。標準の `CONNECT` は不正なリクエストとしてリセットし、`:scheme` と `:path` も持つものには `501` を返します。**次のリリース：** HTTP/1.1 や HTTP/2 と同じく、`Allow` 付きの `405` を返します。 |

オリジンの前に CDN がある場合、HTTP/3 は CDN 自身が終端し、オリジンとは HTTP/1.1 または HTTP/2 で通信します。その場合、ここでのリスナーからは訪問者のブラウザーが何を使ったかは分かりません。CDN 側の HTTP/3 設定を確認してください。

## ⚠️ うまくいかないとき

- **`option --http3: the installed libcurl version doesn't support this`。** クライアントが HTTP/3 に対応していません。上のようにコンテナを使ってください。
- **`curl --http3` が止まる、またはタイムアウトする。** どこかで UDP 443 が塞がれています。まずプロバイダーのファイアウォールやセキュリティグループを、次にホストのものを確認してください。
- **ホストに UDP のリスナーが無い。** `servers` のプロトコル一覧に `h3` が無いか、実行中のファイルが編集したファイルではありません（[再読み込みの意味](/ja/start/service/#-再読み込みの意味)）。
- **ローカルでは HTTP/3 が動くのに外部からは動かない。** クライアントのネットワークが UDP 443 を塞いでいます。企業やホテルのネットワークではよくあることで、ブラウザーは黙ってフォールバックします。
- **`http3 off` を指定したサイトが HTTP/3 で応答し続ける。** v0.2.0-rc.3 ではこのオプションに効果がありません。どのサイトにも HTTP/3 を使わせたくない場合は、グローバルの一覧から `h3` を外してください。

## 🧭 次の手順

- [TLS で調整できること](/ja/guides/tls-tuning/)：プロトコル一覧、証明書、クライアント証明書。
- [プロジェクト状況](/ja/project/status/)：このリリースで対応しているもの、拒否するもの、既知の不具合。
- [`tls`](/ja/reference/directives/#tls)：文脈の中での `http3` オプション。
