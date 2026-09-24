---
title: TLS で調整できること
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair が従う TLS とプロトコルの設定、名前を挙げて拒否する設定、そしてクライアント証明書を必須にする方法と証明書ストアをホスト間で移す方法。
---

Pingclair の TLS 設定が少ないのは意図的です。名前には自動的に証明書が割り当てられ、このページの設定はその方法を決めるものです。Caddy が受け付けるそれ以外の TLS 設定は、無視されるのではなく名前を挙げて拒否されるため、設定が書かれている内容より黙って少ないことしかしない、ということはありません。以下の結果はすべて実際のホストで測定したものです。

📌 このページは最新の公開リリースである **v0.2.0-rc.3** を対象にしています。サーバーの `main` ブランチにしかない変更には **次のリリース** と記しています。

## 🧾 はじめる前に

- Pingclair がインストールされて動いていること（[インストール](/ja/start/install/)）。
- 認証局に関わる部分では、ホストに解決される名前、または検証用マシン向けの内部認証局（[HTTPS](/ja/start/https/)）。

## 🌐 どのプロトコルを配信するか

プロトコルの組み合わせは、グローバルの `servers` ブロックに書きます。

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

`sudo ss -lun | grep ':443 '` で測定した結果です。

| 設定 | UDP 443 のリスナー |
| --- | --- |
| `protocols h1 h2` | 0 — HTTP/3 なし |
| `protocols h1 h2 h3` | 1 — HTTP/3 有効 |

⚠️ この一覧が決めるのは **HTTP/3** だけです。`h1` だけを並べても HTTP/2 は無効になりません。`protocols h1` の場合でも、`h2` を提示したクライアントは HTTP/2 をネゴシエートしました。サーバーがこの一覧から読み取るのは `h3` が含まれているかどうかだけなので、HTTP/2 を無効にする設定はありません。`protocols` 行が無い場合、HTTP/3 は有効です。

サイト単位では、`http3 off` は QUIC リスナーが他の名前を配信し続けたまま、1 つの名前だけを HTTP/3 から外すためのものです。

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

⚠️ v0.2.0-rc.3 では、このオプションは受け付けられるものの効果がありません。**次のリリース：** 効果を持つようになり、そのサイトは `Alt-Svc` で HTTP/3 を告知しなくなります。

## 🏛️ 証明書の入手元

入手元は 3 つあり、いずれも [HTTPS のページ](/ja/start/https/)で説明しています。

| 入手元 | 設定 | 用途 |
| --- | --- | --- |
| Let's Encrypt | 公開名をそのまま書く | 公開名。バックグラウンドで更新されます。 |
| 内部認証局 | `tls internal` | 検証用の名前、非公開のオリジン、トンネル。 |
| 自分のファイル | `tls { cert … key … }` | 他で発行された証明書。 |

更新はバックグラウンドで行われます。グローバルの `renewal_window_ratio` オプションで、各証明書の有効期間に対する割合として、更新を始める時期を設定できます。

## 🔐 クライアント証明書

`client_auth` を指定すると、サーバーはクライアントに証明書を求めます。`openssl` で小さな認証局とクライアント証明書を作り、サイトにはその認証局の証明書**ファイル**を指定します。

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

実測では、クライアント証明書の無いリクエストはハンドシェイクに失敗し、同じリクエストに `--cert client.crt --key client.key` を付けると `200` が返りました。

モードは `request`、`require`、`verify_if_given`、`require_and_verify` です。綴りを誤ったモードは、`(expected request, require, verify_if_given or require_and_verify)` という一覧全体とともに拒否されます。

⚠️ `trusted_ca_cert` は証明書そのものを 1 行の base64 で受け取り、`trusted_ca_cert_file` はパスを受け取ります。前者にパスを渡すとコンパイルは通りますが、起動時に `trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` で失敗します。45 は `-----BEGIN` の `-` です。また、ファイルは `pingclair` ユーザーが読める必要があります。

## 📦 証明書ストアの移行

ストアには、発行済みの証明書、ACME アカウント、内部認証局が入っています。パッケージでインストールした場合は `/var/lib/pingclair/.local/share/pingclair`、つまりサービスアカウントのホーム配下のデータディレクトリです。別のユーザーとして実行したコマンドはそのユーザー自身のデータディレクトリを参照するため、例では `PINGCLAIR_TLS_STORE` を設定しています。これが無いと、root は `/root/.local/share/pingclair` を使います。ストアの移行には `storage-export` と `storage-import` を使います。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/.local/share/pingclair
sudo mkdir -p /var/lib/pingclair/.local/share/pingclair && sudo chown pingclair:pingclair /var/lib/pingclair/.local/share/pingclair
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/.local/share/pingclair
```

実行から分かった点が 3 つあります。アーカイブは名前にかかわらず**プレーンな tar** で、モード `600` で書き込まれるため、読み戻すには root が必要です。インポートはアーカイブに記録された所有者を復元します。また、ストアには Admin API が最後に適用した設定である `autosave.json` が含まれるため、インポートするとそれも復元されます。

**次のリリース：** 内部認証局は Caddy と同じく `pki/authorities/local/` に置かれます。旧来の `internal/` ディレクトリは移行されません。サーバーは新しい認証局を作成するため、すべてのクライアントで新しいルートを信頼し直す必要があります（`pingclair trust`）。また、グローバルの `storage file_system <path>` オプションで、設定の中でストアを指定できるようになります。

その後サービスが `Internal CA I/O error: Permission denied` で起動を拒む場合は、ストアのファイルにサービスアカウントの書き込み権限がありません。`sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair` で直り、サイトは再び応答します。

## 🚫 調整できないもの

Pingclair は次の Caddy の設定を認識したうえで拒否します。そのため、どれかが黙って落とされたままファイルが動くことはありません。

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

したがって、暗号スイート、曲線、ALPN の一覧、オンデマンド発行は、設定ではなくビルドによって固定されています。OCSP ステープリングも行いません。これらのどれかが必要な場合、それは設定の誤りではなく機能要望です。

## ⚠️ うまくいかないとき

- **`client_auth` が `not valid base64` で起動を拒む。** `trusted_ca_cert` にパスを渡しています。ファイルを指定する綴りは `trusted_ca_cert_file` です。
- **有効な証明書を持つクライアントが拒否される。** それに署名した CA が `trusted_ca_cert_file` のものと同じか、証明書が期限切れでないかを確認してください。
- **`tls ciphers`／`tls curves`／`tls alpn`／`tls on_demand` でファイルが拒否される。** これらは実装されていません。上の節を参照してください。
- **`protocols h1 h2` の後も HTTP/3 が動いている。** この一覧が HTTP/3 を制御するので、本来は動きません。UDP 443 がまだ待ち受けているなら、実行中のファイルは編集したファイルではありません（[再読み込みの意味](/ja/start/service/#-再読み込みの意味)）。
- **ストアを移した後にサービスが起動しない。** 上で説明した所有者の問題です。

## 🧭 次の手順

- [HTTPS](/ja/start/https/)：証明書を得る 4 つの方法と、それぞれの正確なログ行。
- [HTTP/3](/ja/guides/http3/)：有効にする方法と、クライアントが使ったことを確かめる方法。
- [`tls`](/ja/reference/directives/#tls)：ディレクティブリファレンス。
