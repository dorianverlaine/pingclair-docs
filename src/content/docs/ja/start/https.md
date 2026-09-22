---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: 公開名の証明書を取得し、内部証明書を配布し、または自分の証明書を持ち込み、サーバーが実際に何を配信するかを確認します。
---

サイトブロックのアドレスが公開名であれば、`tls` ディレクティブ無しで HTTPS に
なります。Pingclair は ACME で Let's Encrypt に証明書を要求し、80 ポートで
HTTP-01 チャレンジに応答し、結果を保存してバックグラウンドで更新します。残り
三つの方法 — DNS-01、ローカル認証局、自分で用意するファイル — については、それ
ぞれ何が必要かを以下に書きます。

## 🧾 はじめる前に

- このホストに解決する名前。サーバーを疑う前に確認します:
  `dig +short A example.com`。
- インターネットから到達できる 80 と 443。HTTP-01 チャレンジは 80 で応答し、
  証明書は 443 で使われます。
- ACME アカウント用のメールアドレス。実在のメールボックスが必要です。Let's
  Encrypt は予約された example ドメインを拒否し、発行は
  `contact email has forbidden domain "example.com"` で失敗します。

以下の設定は、サービスが実行する `/etc/Pingclair/Pingclairfile` を置き換え
ます。再読み込みの前に検証してください。その流れは
[クイックスタート](/ja/start/quickstart/) に、再読み込みの意味は
[サービスとして動かす](/ja/start/service/) にあります。

## 🌐 Let's Encrypt からの証明書

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

設定はこれだけです。起動時にサーバーがホスト名を許可し、ACME フローを開始し、
チャレンジに応答します。

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

アクセスログに残るチャレンジ要求はブラウザではなく認証局からのものです。

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

別のマシンから、実際に何が配信されているかを確認します。

```bash
curl -I https://example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
etag: "493b-6ab1f452"
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

```text
subject=CN=example.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 22 02:35:03 2026 GMT
notAfter=Dec 21 02:35:02 2026 GMT
```

証明書の実体はサービスアカウントのデータディレクトリ、
`/var/lib/pingclair/.local/share/pingclair` に保存されます——そのアカウントのホームから
バイナリが解決するパスで、別のユーザーでコマンドを走らせたときに
`PINGCLAIR_TLS_STORE` が名指しするパスでもあります。

## 📡 DNS-01 とワイルドカード

DNS-01 は 80 ポートで応答する代わりに TXT レコードを公開して名前の支配を証明
します。ワイルドカード証明書にはこれが必要です。設定にはプロバイダーのブロック
が要ります。

```caddyfile
{
    email bonjour@pingclair.com
}

*.example.com {
    tls {
        auto
        dns cloudflare <token>
        resolvers 1.1.1.1
        propagation_delay 10s
    }
    file_server /var/lib/pingclair/html
}
```

見落としやすい点が二つあります。ブロック内の `auto` 行が名前を発行対象の
リストに載せます。これが無いとサーバーは `authorised for 0 hostname(s)` と記録
して証明書を一切要求せず、すべてのハンドシェイクが `NO_CERTIFICATE_SET` で
失敗します。もう一つ、トークンはその名前を含むゾーンに対する `Zone:DNS:Edit`
権限を持つ Cloudflare API トークンです。

🃏 **1 枚のリーフがサイト全体を覆います。** `*.example.com` のサイトは
`*.example.com` 自体を注文します。起動時に取得した 1 枚の証明書が、その下の
すべての名前に使われます。ワイルドカードは 1 ラベルだけを覆うので、apex には
独自のエントリが必要です — `example.com` でも応答するなら
`*.example.com, example.com` と書き、各サブジェクトは書いたとおりに注文されます。
こうして配信されるサブドメインは Certificate Transparency のログに出ません。
これがワイルドカードを使う privacy 上の理由そのものです。

サイト配下のどの名前も、この 1 枚のリーフで配信されます。別のマシンから:

```bash
curl -I https://anything.example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername anything.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName
```

```text
subject=CN=*.example.com
issuer=C=US, O=Let's Encrypt, CN=YE1
X509v3 Subject Alternative Name:
    DNS:*.example.com
```

## 🏛️ 内部認証局からの証明書

プライベートなオリジン — トンネル、内部ホスト名、実験用マシン — には、
Pingclair 自身を認証局にできます。

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

サイトは `CN=Pingclair Local Authority` が 10 年間有効で発行した証明書で応答し、
ルートはストアに公開されます。

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

クライアントはまだ信頼していないため、`-k` 無しの要求は失敗します。ルートを
システムの信頼ストアに導入します。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

`PINGCLAIR_TLS_STORE` の接頭辞が重要です。`pingclair trust` は実行したユーザーの
ストア（root なら `/root/.local/share/pingclair`）を見ますが、サービスは
`/var/lib/pingclair/.local/share/pingclair` を使います。接頭辞が無いと
`No internal CA root at /root/.local/share/pingclair/internal/root.crt` と答えます。

ルートを信頼したあとは、同じ要求が `-k` 無しで成功します。

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` は同じストア接頭辞で再び取り除きます。

## 📜 自分で用意する証明書

別のシステムが証明書を発行する場合は、`tls` をファイルに向けます。

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

サービスは `pingclair` ユーザーで動くので、ファイルはそのユーザーが読める必要が
あります。`validate` は存在しないパスを最初のハンドシェイクで失敗させるのでは
なく拒否します。

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ HTTPS が立ち上がらないとき

- **`contact email has forbidden domain "example.com"`。** Let's Encrypt は予約
  された example ドメインをアカウント連絡先として拒否します。`email` オプション
  には実在のメールボックスを入れてください。
- **ログの `NO_CERTIFICATE_SET`。** サーバーが証明書を持たない名前でハンド
  シェイクが来ています。すぐ上のログを読んでください。`auto` の無い `tls`
  ブロックは発行を開始せず、DNS-01 はこのリリースでは完了しません。
- **チャレンジが配信されない。** 80 ポートがファイアウォールで塞がれているか、
  別のプログラムが握っています。認証局は
  `http://your-name/.well-known/acme-challenge/` にインターネットから到達できる
  必要があります。
- **名前がこのホストに解決しない。** `dig +short A your-name` は認証局が接続する
  先を示します。最近の変更後は、期待どおりでないことがよくあります。
- **失敗の繰り返し。** Let's Encrypt は名前ごとに検証失敗を制限します。原因を
  直してから再試行してください。そうしないと再試行そのものがエラーになります。

## 🧭 次の手順

- [サービスとして動かす](/ja/start/service/): ユニット、再読み込みの意味、ログ。
- [`tls`](/ja/reference/directives/#tls): ディレクティブのすべてのモードと
  オプション。
- [Pingclairfile](/ja/reference/pingclairfile/): アドレス、マッチャー、そして
  コンパイラが受け入れるもの。
