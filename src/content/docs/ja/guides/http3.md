---
title: HTTP/3 を配信する
h1_emoji: '⚡'
sidebar:
  order: 4
description: HTTP/3 を有効にし、クライアントが本当に使ったことを示し、QUIC 上で挙動が変わる要求を知ります。
---

HTTP/3 は、何かを導入しなくても使えるという意味で既定で有効です。プロトコルの集合が
許せば、サーバーは UDP 443 に QUIC リスナーを開きます。注意が要るのは検証です。
黙って HTTP/2 に落ちたクライアントは、成功とまったく同じに見えます。

## 🧾 はじめる前に

- ホストに解決する名前と、その名前の証明書（[HTTPS](/ja/start/https/)）。
- プロバイダのファイアウォールとホスト側の両方で **UDP 443 を開放**すること。
  QUIC に代替はありません。UDP が塞がれていれば、クライアントは HTTP/2 を使い、
  そのことを告げません。
- HTTP/3 対応のクライアント。多くのディストリビューションの `curl` は非対応で、
  要求すればはっきり分かります。

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 有効にする

```caddyfile
{
    email pingclair@aqeo.dev
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

サイトを動かした状態でホスト上で実測:

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

リストから `h3` を外すとこのリスナーは消えます。リストがスイッチです
（[TLS で調整できること](/ja/guides/tls-tuning/#-which-protocols-are-served)）。
リスナーを止めずに 1 つのサイトだけ HTTP/3 から外すこともできます。

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

## ✅ クライアントが使ったことを示す

サーバーのアクセスログはプロトコルを名乗らないので、証拠はクライアント側から取り
ます。ngtcp2 か quiche でビルドされた curl なら何でもよく、HTTP/3 を使えない curl
しかないホストではコンテナが最短です。

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

`--network host` が、コンテナにホストの UDP 経路を使わせます。無いと QUIC を塞ぐ
ネットワーク名前空間を通ることがあります。

最初の行がすべての答えです。ステータス行は `HTTP/2` ではなく `HTTP/3` です。同じ
URL を `--http2` と `--http1.1` で要求すると残り二つが表示され、クライアントが
単に落ちているのではないと分かります。

コンテナが使えない場合、QUIC ハンドシェイクはシステムの OpenSSL 3.5 以降で確認
できます。

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` と検証済みのチェーンは、その名前に対して QUIC リスナーが
クライアントの信頼する証明書で応答していることを示します。完全な HTTP/3 要求を
示すものではなく、それは curl の確認の役目です。

## 🧭 HTTP/3 で異なること

ポリシー層は HTTP/1.1 と HTTP/2 と共有しているので、ルーティング、マッチャー、
ヘッダー、レート制限、アクセスログは同じに動きます。異なるのは、トランスポートが
何かを運べない箇所です。

| 領域 | HTTP/3 では |
| --- | --- |
| 宣言された要求トレーラー | 転送されません。応答確定前は `501`、確定後はストリームをリセットします。 |
| アムトの応答トレーラー | `502`。 |
| `CONNECT` と拡張 `CONNECT` | トンネル実装まで `501`。 |
| `php_fastcgi` | `501`。FastCGI は HTTP/1.1 と HTTP/2 のみです。 |

手前に CDN がある場合、HTTP/3 を終端するのは CDN で、オリジンとは HTTP/1.1 か
HTTP/2 で話します。したがって、ここのリスナーは訪問者のブラウザが何を使ったかを
示しません。それは CDN 側の HTTP/3 設定を確認してください。

## ⚠️ うまくいかないとき

- **`option --http3: the installed libcurl version doesn't support this`。**
  クライアントが HTTP/3 非対応です。上のコンテナを使ってください。
- **`curl --http3` が固まる、または時間切れ。** どこかで UDP 443 が塞がれて
  います。まずプロバイダのファイアウォールやセキュリティグループ、次にホストを
  確認します。
- **ホストに UDP リスナーが無い。** プロトコルのリストに `h3` が無いか、動いて
  いるファイルが編集したファイルではありません
  （[再読み込みの意味](/ja/start/service/#-再読み込みの意味)）。
- **ローカルでは HTTP/3 が動き、外からは動かない。** クライアントのネットワークが
  UDP 443 を塞いでいます。企業やホテルでよくあり、ブラウザは黙って落ちます。
- **FastCGI のルートが `501` を返す。** HTTP/3 では設計どおりです。
  [プロジェクトの状態](/ja/project/status/) にどこで何が配信されるかがあります。

## 🧭 次の手順

- [TLS で調整できること](/ja/guides/tls-tuning/): プロトコルのリスト、証明書、
  クライアント証明書。
- [プロジェクトの状態](/ja/project/status/): このリリースで支えているもの、
  拒否するもの、既知の不具合。
- [`tls`](/ja/reference/directives/#tls): `http3` オプションの文脈。
