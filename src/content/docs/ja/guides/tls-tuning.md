---
title: TLS で調整できること
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair が尊重する TLS とプロトコルの設定、名前を挙げて拒否する設定、クライアント証明書の要求方法、証明書ストアの移し方をまとめます。
---

Pingclair の TLS の表面は意図的に小さくできています。名前は自動で証明書を取得し、
その仕組みを決める設定がここに書かれているものです。Caddy が受け付けるそれ以外は
黙って無視されず名前を挙げて拒否されるので、設定が名目より静かに劣ることは
ありません。このページは、実機で測った「実際に効くもの」と「効かないもの」を
集めたものです。

## 🧾 はじめる前に

- Pingclair が導入され動いていること（[インストール](/ja/start/install/)）。
- 認証局に関わる部分では、ホストに解決する名前、または実験機向けの内部認証局
  （[HTTPS](/ja/start/https/)）。

## 🌐 どのプロトコルを配信するか

プロトコルの集合はグローバルの `servers` ブロックに置きます。

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

`sudo ss -lun | grep ':443 '` による実測:

| 設定 | UDP 443 リスナー |
| --- | --- |
| `protocols h1 h2` | 0 — HTTP/3 なし |
| `protocols h1 h2 h3` | 1 — HTTP/3 有効 |

⚠️ このリストが決めるのは **HTTP/3** だけで、それ以外ではありません。`h1` だけを
並べても HTTP/2 は外れません。`protocols h1` でも、ALPN で `h2` を提示した
クライアントは HTTP/2 を交渉しました。コンパイラはこのリストを HTTP/3 の
スイッチに写しているだけです（`config.global.http3 = protocols.contains(H3)`）。
名前ごとに HTTP/2 を無効にする設定はありません。

サイト単位では `http3 off` が、QUIC リスナーを止めずにその名前を HTTP/3 から
外します。

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

## 🏛️ 証明書の入手元

三つあり、いずれも [HTTPS のページ](/ja/start/https/) に書いてあります。

| 入手元 | 設定 | 用途 |
| --- | --- | --- |
| Let's Encrypt | 素の公開名 | 公開名。バックグラウンドで更新。 |
| 内部認証局 | `tls internal` | 実験用の名前、私有オリジン、トンネル。 |
| 自分のファイル | `tls { cert … key … }` | 他所で発行した証明書。 |

更新は自動で走ります。グローバルオプションの `renewal_window_ratio` は、各証明書の
寿命のうちどれだけ早く更新を始めるかを割合で決めます。

## 🔐 クライアント証明書

`client_auth` はクライアントの証明書を要求します。`openssl` で小さな認証局と
クライアント証明書を作り、サイトを認証局の**ファイル**に向けます。

```caddyfile
https://internal.test {
    tls {
        internal
        client_auth {
            mode require_and_verify
            trusted_ca_cert_file /etc/pingclair/client-ca.crt
        }
    }
    file_server /srv/site
}
```

実測: クライアント証明書なしの要求はハンドシェイクで失敗し、
`--cert client.crt --key client.key` を付けた同じ要求は `200` を返します。

モードは `request`、`require`、`verify_if_given`、`require_and_verify` で、代替は
ありません。綴りを間違えると
`(expected request, require, verify_if_given or require_and_verify)` と一覧付きで
拒否されます。

⚠️ `trusted_ca_cert` は証明書を**インライン**で受け取り、`trusted_ca_cert_file` は
パスを受け取ります。前者にパスを渡すとコンパイルは通り、起動時に
`trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` で
失敗します（`-----BEGIN` の `-`）。ファイルは `pingclair` ユーザーから読める必要も
あります。

## 📦 証明書ストアの移行

`PINGCLAIR_TLS_STORE` が指すストア（インストール済みユニットでは
`/var/lib/pingclair/certs`）には、発行済み証明書、ACME アカウント、内部認証局が
入っています。`storage-export` と `storage-import` がそれを移します。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/certs
sudo mkdir -p /var/lib/pingclair/certs && sudo chown pingclair:pingclair /var/lib/pingclair/certs
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/certs
```

実行から三つの点。アーカイブは名前に関わらず**ただの tar** で、モード `600` で
書かれるため読み戻すには root が必要です。インポートはアーカイブに記録された所有権を
そのまま復元します。そしてストアには `autosave.json`（Admin API が最後に適用した
設定）も含まれるので、それも一緒に戻ります。

その後サービスが `Internal CA I/O error: Permission denied` で起動を拒むなら、
ストアのファイルがサービスアカウントから書けません。
`sudo chown -R pingclair:pingclair /var/lib/pingclair/certs` で直り、サイトは再び
応答します。

## 🚫 調整できないもの

以下は Pingclair が認識して拒否する Caddy の設定です。設定が黙って落とされたまま
実行されることはありません。

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

つまり暗号スイート、曲線、ALPN の一覧、オンデマンド発行は設定ではなくビルドの
選択です。OCSP ステープリングと `preferred_chains` も実装されていません。どれかが
必要なら、設定ミスではなく機能要望です。

## ⚠️ うまくいかないとき

- **`client_auth` が `not valid base64` で起動を拒む。** `trusted_ca_cert` に
  パスを渡しています。ファイル用の綴りは `trusted_ca_cert_file` です。
- **有効な証明書を持つクライアントが拒否される。** 署名した認証局が
  `trusted_ca_cert_file` のものか、証明書が期限切れでないかを確認します。
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand` がファイルを
  拒否する。** 実装されていません。上の節を参照してください。
- **`protocols h1 h2` でも HTTP/3 が動き続ける。** 本来は止まります。それを決める
  のがこのリストです。UDP 443 がまだ待ち受けているなら、動いているファイルは
  編集したファイルではありません
  （[再読み込みの意味](/ja/start/service/#-what-a-reload-means)）。
- **ストアを移したあとサービスが起動しない。** 上記の所有権の問題です。

## 🧭 次の手順

- [HTTPS](/ja/start/https/): 証明書を得る四つの方法と、その正確なログ行。
- [HTTP/3](/ja/guides/http3/): 有効にして、クライアントが使ったことを示す方法。
- [`tls`](/ja/reference/directives/#tls): ディレクティブのリファレンス。
