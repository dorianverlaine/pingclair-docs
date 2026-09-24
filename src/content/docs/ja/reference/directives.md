---
title: ディレクティブ
h1_emoji: '🧾'
description: このリファレンスが扱う Pingclairfile のディレクティブとグローバルオプションについて、構文、既定値、書ける場所、拒否される入力、Caddy との違い。
---

各項目は決まった形式のヘッダーで始まります。構文、ディレクティブが無い場合の既定値、そしてディレクティブを書ける場所です。続いて、ディレクティブが何をするか、何を拒否するか、Caddy とどこが違うかを説明します。

📌 このページは最新の公開リリースである **v0.2.0-rc.3** を対象にしています。次のリリースで挙動が変わる場合は、項目の中の **次のリリース** に記しています。その挙動はサーバーの `main` ブランチにあり、まだ公開されたビルドには含まれていません。

📖 このページが扱うのは言語の一部です。ここに載っていないディレクティブも `pingclair validate` で検査され、サーバーが実装していないディレクティブは、受け付けて無視されるのではなく、名前を挙げて拒否されます。

## basic_auth

```text
Syntax:   basic_auth [<matcher>] [bcrypt|argon2id [<realm>]] {
              <username> <hashed_password>
              ...
          }
Default:  no authentication
Context:  site block, handle, route
```

リクエストを先に進める前に、HTTP Basic 認証の資格情報を要求します。ブロックの各行が 1 つのアカウントで、ユーザー名とパスワードのハッシュを書きます。パスワードそのものは書きません。ハッシュは `pingclair hash-password` で生成します（[コマンドライン](/ja/reference/command-line/#pingclair-hash-password)）。

ディレクティブの行に書くアルゴリズムで、ブロック内のすべてのハッシュを照合します。既定は `bcrypt` です。それ以外のアルゴリズム名は拒否され、ブロックの無い `basic_auth` も拒否されます。

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode off
Default:  gzip in v0.2.0-rc.3; no compression in the next release
Context:  site block
```

レスポンスを圧縮します。形式は優先順に並べます。クライアントが複数を受け付ける場合は、先に書いたものが選ばれます。対応する形式は `zstd` と `gzip` で、引数の無い `encode` は `gzip` を意味します。`encode off` はそのサイトの圧縮を無効にします。

拒否される入力：

- `encode br` は読み込み時に拒否されます。プロキシにはストリーミング対応の Brotli エンコーダーが無く、サーバーは黙って gzip に切り替えることもしません：`` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- 未知の形式は、有効な形式の一覧とともに拒否されます。
- 圧縮はルート単位ではなくサイト単位で設定するため、パスマッチャーや名前付きマッチャーは拒否されます。すべてにマッチする `*` マッチャーは受け付けます。

Caddy との違い：v0.2.0-rc.3 では、`encode` 行の無い Pingclairfile のサイトでも gzip で圧縮されます。Caddy が圧縮するのは `encode` で指定した場合だけです。

**次のリリース：** Caddy と同じく、サイトは `encode` で指定した場合にだけ圧縮します。従来の既定に頼っていたサイトは、`encode gzip` または `encode zstd gzip` を追加する必要があります。

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse
              compress              [off|false]
              precompressed         [br|zstd|gzip ...]
              hide                  <paths...>
              status                <code>
              pass_thru
              disable_canonical_uris
              etag_file_extensions  <extensions...>
          }
Default:  disabled
Context:  site block, handle, route
```

ディスクからファイルを配信します。MIME タイプを判定し、バイトレンジのリクエストに応答し、`ETag` と `Last-Modified` を送ります。ファイルは `root` で設定したサイトのルート、またはこのディレクティブだけに指定したルートから読み込まれます。

- `index` はディレクトリに対して試すファイル名を指定します。既定は `index.html` です。
- `browse` は、インデックスファイルの無いディレクトリに一覧を表示します。
- `compress off` は、圧縮を行うサイトの中で、このファイルサーバーだけを圧縮の対象から外します。
- `precompressed` は、クライアントがその符号化を受け付ける場合に、`app.js.gz` のような隣接ファイルを配信します。引数が無い場合の順序は `br zstd gzip` です。
- `hide` は指定したパスを配信しないようにします。複数行書くと合算されます。
- `status` は、メンテナンスページのために、すべてのファイルをこのステータスで返します。
- `pass_thru` は、ファイルが無い場合に `404` を返さず、次のハンドラーに処理を渡します。
- `disable_canonical_uris` は、ディレクトリに末尾のスラッシュを付けるリダイレクトを止めます。

拒否される入力：ローカルのファイルシステムにしか対応していないため、`fs` は拒否されます。100〜599 の範囲外の `status` と未知のサブディレクティブも拒否されます。

Caddy との違い：位置引数の `<root>` は Pingclair 独自の追加です。Caddy では、`file_server` の後ろに単独で書いたパスはパスマッチャーになります。設定を Caddy でも読み込めるようにする必要がある場合は、`root` を使ってください。

**次のリリース：**

- `browse` がオプションのブロックを受け付け、`file_limit <n>` で一覧に表示する項目数の上限を設定できるようになります。一覧のテンプレート、`reveal_symlinks`、`sort` は名前を挙げて拒否されます。
- `GET` と `HEAD` 以外のメソッドには、`Allow: GET, HEAD` 付きの `405` を返します。
- 条件付きリクエストに応答します。一致する `If-None-Match` や最新の `If-Modified-Since` には `304` を、条件を満たさない `If-Match` や `If-Unmodified-Since` には `412` を返します。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> [<value> [<replacement>]]
          header [<matcher>] {
              <field> <value>                  # set
              +<field> <value>                 # append
              -<field>                         # remove
              ?<field> <value>                 # set only if absent
              <field> <search> <replacement>   # regular-expression replace
              defer
          }
Default:  none
Context:  site block, handle, route
```

レスポンスヘッダーを変更します。フィールド名だけを書くとヘッダーを設定し、`+` 接頭辞は値を追加し、`-` 接頭辞はフィールドを削除します。`?` 接頭辞は、レスポンスにそのフィールドがまだ無い場合にだけ値を設定します。引数が 3 つの場合、2 つ目は正規表現で、3 つ目がそれにマッチした部分を置き換えます。

ヘッダーは常に完成したレスポンスに適用されるため、`defer` と `>` 接頭辞は受け付けられますが、何も変わりません。

拒否される入力：

- 引数とブロックの両方を持つディレクティブは拒否されます。
- 値の無い `header X-Name` は拒否されます。Caddy なら空の値を設定しますが、空のレスポンスヘッダーはほぼ間違いなく削除の書き損じです。
- ブロック内の `match` レスポンスマッチャーは、未実装として拒否されます。

⚠️ `set` というキーワードはありません。ブロック内の `set X-Name value` という行は、`set` という名前のヘッダーに対する正規表現の置換として読まれます。

**次のリリース：** RFC 6797 の要求どおり、`Strict-Transport-Security` は暗号化されたレスポンスにだけ送られ、平文のレスポンスからはすべて取り除かれます。HSTS を有効にするには `header Strict-Transport-Security "max-age=…"` と書きます。

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
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; named channels in global options
```

アクセスログを書き出します。4 つの形式はそれぞれ意味が異なります。

- `log` は、そのサイトの既定のアクセスログを標準出力に有効にします。
- `log { … }` は、そのサイトのアクセスログを設定します。
- `log <name> { … }` は、独自の出力先を持つ名前付きのロガーをサイトに追加します。
- `log <name>` は、グローバルオプションで `log <name> { … }` として宣言した同名のチャネルに、サイトの記録を送ります。

ブロックのオプションには、`output`（`stdout`、`stderr`、または `file <path>`）、`format`（`json` または `console`）、`level`、`hostnames` セレクター、`include` と `exclude` のフィルター、`sampling`、そしてファイルのローテーション（`roll_size`、`roll_keep`、`roll_keep_for`、`mode`、`dir_mode`、その他の `roll_*` オプション）があります。

拒否される入力：グローバルのチャネルはサイトに結び付いていないため、`hostnames` を使えません。同じチャネルを 2 回宣言すると拒否されます。

記録は書き出す前にまとめられます。追いつけない出力先は記録を捨て、その数を `pingclair_access_log_dropped_total` で数えます。

**次のリリース：** 名前の無いグローバルの `log { … }` ブロックは拒否されます。v0.2.0-rc.3 では受け付けられますが、何もしません。

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] [<upstream> ...] { ... }
Default:  none
Context:  site block, handle, route
```

リクエストを 1 つ以上のアップストリームに転送します。`lb_policy` でリクエストの分散方法を選びます。v0.2.0-rc.3 での既定は `round_robin` です。

ホスト名で指定したアップストリームは、グローバルの `dns_refresh` で設定した間隔で再解決されるため、新しいアドレスで再起動したバックエンドにも再読み込みなしで追従します。解決に失敗した場合は、以前のアドレスがローテーションに残ります。

アクティブヘルスチェックは、リクエストとは別に各アップストリームを調べます。異常なアップストリームはユーザーのリクエストが届く前にローテーションから外れ、設定した回数のプローブが成功すると戻ります。`backup` のアップストリームは、すべての主アップストリームが利用できないときにだけ使われます。

拒否される入力：未知のオプションは、`Unknown directive 'reverse_proxy: dial_timeout'` のように完全な名前とともに拒否されます。タイムアウトは `transport http` ブロックに書きます。

**次のリリース：**

- `lb_policy` の既定値が、Caddy の既定と同じ `random` になります。現在の挙動を保つには `lb_policy round_robin` と書いてください。
- `lb_policy first` は常に利用可能な最初のアップストリームを選びます。v0.2.0-rc.3 では `round_robin` と同じように動作します。
- Pingclair 自身が生成した `502` や `504` には `Proxy-Status: pingclair; error=…` が付き、バックエンドが送ったものと区別できます。

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

各オプションは[リバースプロキシのガイド](/ja/guides/reverse-proxy/)で順に説明しています。

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle, route
```

サイトのルートを設定します。`file_server`、`try_files`、その他のファイルを扱うディレクティブは、このディレクトリを基準にパスを解決します。`file_server` は独自のルートを持つこともできますが、ここで設定すれば、すべてのディレクティブが 1 つの場所を指すようになります。

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

サイトの証明書の入手元を制御します。`tls` 行が無い場合、公開名には Let's Encrypt から自動的に証明書が取得されます。

| 形式 | 挙動 |
| --- | --- |
| `tls internal` | 永続的なローカル認証局から発行します。クライアントはそのルートを信頼する必要があり、`pingclair trust` でインストールできます。 |
| `tls <cert> <key>`、またはブロック内の `cert` と `key` | 他で発行された証明書と鍵のファイルを使います。 |
| `tls { auto }` | ACME で公開証明書を取得して更新します。公開名ではこれが既定でもあります。 |

ブロックでは、`acme_email`（または `email`）、`http3`、`default_sni`、`client_auth`、そして DNS-01 のオプション（`dns`、`resolvers`、`dns_ttl`、`propagation_delay`、`propagation_timeout`、`dns_challenge_override_domain`）も受け付けます。

`http3 off` はこのサイトを HTTP/3 から外します。QUIC リスナーを作ったり取り除いたりはしません。それを決めるのはグローバルの `servers { protocols … }` の一覧です（[TLS で調整できること](/ja/guides/tls-tuning/#-どのプロトコルを配信するか)）。

拒否される入力：

- `dns` が受け付けるのは `cloudflare` だけです。それ以外のプロバイダーは拒否されます：``DNS provider `route53` is not implemented; this build ships `cloudflare` only``。
- `protocols`、`ciphers`、`curves`、`alpn`、`on_demand`、`key_type`、`issuer`、および上に挙げていない Caddy のその他のオプションは、名前を挙げて拒否されます。
- `tls internal` は、`auto`、ACME のメールアドレス、証明書ファイルと組み合わせられません。

**次のリリース：**

- `http3 off` が効果を持つようになります。v0.2.0-rc.3 では受け付けられますが、効果はありません。そのサイトのレスポンスは、`Alt-Svc` で HTTP/3 を告知しなくなります。
- 内部認証局のルートは、Caddy と同じ配置の `<store>/pki/authorities/local/root.crt` に移ります。旧来の `<store>/internal/` は移行されません。新しい認証局が作成されるため、クライアントはそのルートを信頼し直す必要があります。

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## Global options

グローバルオプションは、ファイル先頭の無名ブロックに書きます。`protocols` や `trusted_proxies` のように Caddy が `servers { … }` の下に入れるオプションも、そこで受け付けます。

| オプション | 構文 | 補足 |
| --- | --- | --- |
| `admin` | `admin [<address> [<token>]] \| off` | Admin API を有効にします。既定のアドレスは `127.0.0.1:2019` です。トークンが無い場合、受け入れるのはループバックのクライアントだけです。このオプションが無ければ、Admin API はありません。 |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 自動 HTTPS とポート 80 のリダイレクトを制御します。`disable_certs` と `ignore_loaded_certs` は名前を挙げて拒否されます。 |
| `dns_refresh` | `dns_refresh <duration> \| off` | ホスト名で指定したアップストリームを再解決する間隔です。既定は `30s` です。`off` は起動時に解決したアドレスを使い続けます。単位の無い数値は拒否されます。 |
| `email` | `email <address>` | ACME アカウントのメールアドレス。 |
| `grace_period` | `grace_period <duration>` | グレースフルな停止が、処理中のリクエストを待つ時間。v0.2.0-rc.3 では、この値にかかわらず約 250 ms で終了します。**次のリリース：** 停止時に最大この時間までリクエストの完了を待ちます。 |
| `protocols` | `protocols h1 h2 h3` | HTTP/3 のリスナーを用意するかどうか。[TLS で調整できること](/ja/guides/tls-tuning/#-どのプロトコルを配信するか)を参照してください。 |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | 転送ヘッダーでクライアントのアドレスを伝えることを許すピア。変更には再起動が必要です。**次のリリース：** Caddy の書き方である `trusted_proxies static <cidr \| private_ranges> ...` も受け付けます。 |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
