---
title: ディレクティブ
h1_emoji: '🧾'
description: 本書が扱うディレクティブの構文、既定値、適用範囲。
---

各項目は構文、指定がない場合の既定値、書ける場所を示します。バージョン表記（どのバージョンで導入されたかを示す `Since:` 行）はまだ公開していません。

📖 本ページは出発点となる一部を扱います。ここに未記載でも、受理されるディレクティブは `pingclair validate` が検証します。サーバーが実装していないディレクティブは、黙って受理されるのではなく名前を挙げて拒否されます。

## encode

```text
Syntax:   encode <format> [<format> ...]
Default:  no compression
Context:  site block
```

レスポンスを圧縮します。引数は優先順に並べ、クライアントが受理する最初の形式を使います。対応する形式は `zstd` と `gzip` です。

Brotli を指定すると、gzip への暗黙の降格ではなくコンパイルエラーになります。プロキシにストリーミングの Brotli エンコーダーがなく、そのオプションを満たせないためです。

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<root>]
Default:  disabled
Context:  site block
```

ディスクからファイルを配信します。MIME タイプの判定、レンジリクエスト、ETag と `Last-Modified` による検証に対応します。引数を指定するとこのディレクティブ自身のルートになり、省略すると `root` で設定したサイトルートを使います。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> <value>
          header [<matcher>] {
              <field> <value>      # set
              +<field> <value>     # append
              -<field>             # remove
              set <field> <value>  # set, spelled explicitly
          }
Default:  none
Context:  site block
```

レスポンスヘッダーを追加、置換、削除します。フィールド名だけを書くと設定、`+` を前置すると追加、`-` を前置すると削除です。

```caddyfile
example.com {
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -X-Powered-By
    }
}
```

## log

```text
Syntax:   log [<name>] { <options> }
Default:  no access sink
Context:  site block, global options
```

アクセスログの出力先を設定します。単独の `log` はそのサイトの既定出力を有効にし、`log <name> { ... }` は名前付きロガーを設定します。ブロックを伴わない `log <name>` は、global options で宣言したチャネルを参照します。

ブロックのオプションには出力先と形式（`output`、`format`）、`hostnames` セレクター、`include` と `exclude` の絞り込み、`sampling`、そしてファイルローテーション（`mode`、`dir_mode`、`roll_*`）があります。

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

レコードは書き出し前にまとめて蓄積されます。追いつけない出力先はレコードを破棄し、`pingclair_access_log_dropped_total` に数えます。すべてのリクエストをシステムジャーナルへ書く場合、ジャーナル受信側の処理コストも負担します。

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] { ... }
Default:  none
Context:  site block
```

リクエストを 1 つ以上の上流へ転送します。既定の負荷分散ポリシーはラウンドロビンです。ホスト名の上流は `dns_refresh` の間隔で再解決されるため、新しいアドレスで再起動したバックエンドにも操作なしで追従します。解決に失敗した場合は、直前のアドレスをローテーションに残します。

```caddyfile
:80 :8080 {
    reverse_proxy {
        lb_policy least_conn
        to 10.0.0.1:8080 {
            weight 3
        }
        to 10.0.0.2:8080
        to 10.0.0.3:8080 {
            backup
        }
        health_check {
            path /health
            interval 5s
            timeout 2s
            status 200 204
            consecutive_failure 3
            consecutive_success 2
        }
    }
}
```

アクティブヘルスチェックは帯域外で実行されるため、失敗したバックエンドは利用者のリクエストが届く前にローテーションから外れ、設定した回数の成功後に復帰します。`backup` の上流は、すべての主要な上流が利用できない場合にだけ使われます。

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block
```

サイトルートを設定します。`file_server` は独自のルートを持てますが、ここで設定すると、ファイルを扱う他のディレクティブとファイルサーバーが同じ場所を指せます。

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls <mode>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

証明書の取得方法を制御します。

| モード | 挙動 |
| --- | --- |
| `tls auto` | ACME で公開証明書を取得し、自動で更新します。 |
| `tls internal` | 常駐するローカル認証局から発行します。ルート証明書は `$PINGCLAIR_TLS_STORE/internal/root.crt` にあり、クライアントが信頼する必要があります。 |
| `tls { cert ...; key ... }` | ブロックで指定した証明書と鍵のファイルを使います。 |

ブロック形式では `http3` で HTTP/3 を有効にでき、`dns cloudflare <token>` による DNS-01 発行にも対応します。実装されている DNS プロバイダーはこれだけです。他のプロバイダー名は、受理して無視するのではなく起動時に拒否されます。DNS-01 はワイルドカード証明書を成立させる前提だからです。

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
        http3
    }
    reverse_proxy localhost:3000
}
```

## 🌍 Global options

Global options はファイル先頭の名前のないブロックに書きます。

| オプション | 構文 | 内容 |
| --- | --- | --- |
| `admin` | `admin <address> [<token>]` | Admin API のリスナー。token がない場合はループバック接続だけを受理します。 |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 自動 HTTPS と 80 番ポートへのリダイレクトを制御します。 |
| `dns_refresh` | `dns_refresh <duration>` | ホスト名上流の再解決間隔。`off` は起動時に解決したアドレスに固定します。 |
| `email` | `email <address>` | ACME 発行に使うアカウントのメールアドレス。 |
| `trusted_proxies` | `trusted_proxies <cidr> [<cidr> ...]` | クライアント識別ヘッダーを主張できる対端。変更には再起動が必要です。 |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
