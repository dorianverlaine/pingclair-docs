---
title: コマンドライン
h1_emoji: '⌨️'
description: pingclair のすべてのサブコマンドとそのフラグ、既定値、前提条件。バイナリ自身の --help の出力と照合済み。
---

Pingclair は 1 つのバイナリです。サーバーの起動から設定の検査まで、すべての作業はそのサブコマンドとして行います。

```bash
pingclair <command> [<args…>]
```

山括弧は必須の値、角括弧は省略可能な値、`…` は繰り返せる値を表します。どのコマンドも `--help` に応答し、`pingclair help <command>` も同じ内容を表示します。コマンドを付けずにバイナリを実行すると、コマンドの一覧が表示されます。

📌 このページは最新の公開リリースである **v0.2.0-rc.3** を対象にしています。サーバーの `main` ブランチにしかない変更には **次のリリース** と記しています。

インストーラはバイナリを `pc` という名前でもリンクするため、以下のどのコマンドにも 2 文字の書き方があります。`pc validate`、`pc service reload` などです。両者は同じプログラムで、`pc` は 2 つ目のバイナリではなくシンボリックリンクです。

## 🚩 グローバルフラグ

| フラグ | 働き |
| --- | --- |
| `-v`、`--verbose` | この実行に限りログレベルを `debug` に上げます。コマンドの前後どちらにも書けます。`caddy -v` と違い、バージョンは表示しません。 |
| `-h`、`--help` | 付けたコマンドのヘルプを表示します。 |
| `-V`、`--version` | バージョンを表示します。トップレベルでのみ使えます。 |

## 🧭 コマンド一覧

| コマンド | 働き |
| --- | --- |
| `run` | サーバーをフォアグラウンドで実行します。 |
| `reload` | 編集した設定を Admin API 経由で適用し、サーバーの判定を報告します。 |
| `start` | サーバーを切り離されたプロセスとして起動します。 |
| `stop` | 実行中のサーバーを Admin API 経由で停止します。 |
| `completion` | シェル補完スクリプトを出力します。 |
| `environ` | サーバーから見える環境を表示します。 |
| `list-modules` | このバイナリに組み込まれたモジュールを一覧表示します。 |
| `build-info` | ツールチェーンを含むビルドのメタデータを表示します。 |
| `manpage` | man ページをディレクトリに書き出します。 |
| `storage-export` | 証明書ストアを tar アーカイブに書き出します。 |
| `storage-import` | その tar アーカイブから証明書ストアを復元します。 |
| `trust` | 内部 CA のルートをシステムの信頼ストアに追加します。 |
| `untrust` | それを再び取り除きます。 |
| `respond` | 開発用に、固定のレスポンスを返します。 |
| `reverse-proxy` | 設定ファイルなしでアップストリームにプロキシします。 |
| `file-server` | 設定ファイルなしでディレクトリを配信します。 |
| `validate` | 設定をコンパイルし、問題点を報告します。 |
| `adapt` | Pingclairfile をコンパイルした JSON 形式を表示します。 |
| `fmt` | Pingclairfile を整形するか、整形で変わる箇所を表示します。 |
| `hash-password` | `basic_auth` 用のパスワードハッシュを生成します。 |
| `version` | バージョンを表示します。 |
| `service` | インストール済みの systemd ユニットを操作します。 |

**次のリリース：** Caddy の書き方である `storage export` と `storage import` が、`storage-export` と `storage-import` の別名として追加されます。ハイフン付きの名前も引き続き使えます。

## pingclair run

1 つの設定ドキュメントでサーバーをフォアグラウンドで実行します。ログは標準出力と標準エラーに出力され、`Ctrl-C` でサーバーが停止します。

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 引数 | 既定値 | 働き |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`、次に `./Caddyfile` | 読み込む設定ファイルまたはディレクトリ。 |

| フラグ | 働き |
| --- | --- |
| `-r`、`--resume` | `caddy run --resume` と同じく、ファイルの代わりに Admin API が最後に自動保存した設定を読み込みます。両方が指定された場合は `CONFIG` より優先されます。 |
| `-w`、`--watch` | 設定ファイルの更新時刻を 1 秒ごとに確認し、変更のたびに再読み込みします。ローカルでの開発向けです。 |

```bash
pingclair run --watch
```

`CONFIG` が無く、既定のファイルもどちらも存在しない場合、`run` はステータス 1 で終了します。Caddy はこの場合に空のサーバーを起動しますが、Pingclair は拒否します。そのため、誤ったディレクトリで入力した `run` は、目に見える形で失敗します。

端末を閉じても動き続けるサーバーには、インストール済みのユニットを使ってください（[サービスとして動かす](/ja/start/service/)）。

## pingclair reload

Admin API（`POST /load`）を通じて、実行中のサーバーに設定ファイルを送ります。リクエストにはサーバー自身が応答するため、コマンドはファイルが適用されたかどうかを報告できます。シグナルではこれができません。systemd が確認できるのは、シグナルが届いたことだけです。

```bash
pingclair reload [OPTIONS]
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`、次に `./Caddyfile` | 適用する設定ファイル。 |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API のアドレス。 |

実行中の設定で、グローバルの `admin` オプションにより Admin API が有効になっている必要があります。それが無ければ到達する先がありません。サーバーが新しいファイルを適用できない場合（多くはリスナーが追加または移動されたとき）、コマンドは失敗し、以前の設定が引き続き配信します。

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

サービスマネージャーを使わずに、シェルの終了後も動き続けるバックグラウンドプロセスとしてサーバーを起動します。

```bash
pingclair start [OPTIONS]
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`、次に `./Caddyfile` | 読み込む設定ファイル。 |

プロセスは端末から切り離され、出力は破棄されるため、ログはどこにも残りません。systemd のあるホストでは、インストール済みのユニットのほうが適しています。ユニットはログを記録し、失敗時に再起動し、リスナーがバインドされたことを把握します。[サービスとして動かす](/ja/start/service/)を参照してください。

## pingclair stop

Admin API の `POST /stop` で実行中のサーバーを停止します。`reload` と同じく、実行中の設定に `admin` オプションが必要です。

```bash
pingclair stop [OPTIONS]
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API のアドレス。 |

## pingclair completion

1 つのシェル向けの補完スクリプトを出力します。対応するシェル名は、引数が受け付ける `bash`、`zsh`、`fish`、`powershell`、`elvish` のみです。

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

このプロセスが引き継いだ環境を、1 行に 1 つずつ `NAME=value` の形式で表示します。起動前に `PINGCLAIR_TLS_STORE` などの値を確認できます。`caddy environ` と違い、サーバーが算出したパスは表示しません。

```bash
pingclair environ
```

## pingclair list-modules

このバイナリに組み込まれたモジュールを一覧表示します。`--json` を付けると、スクリプト向けに同じ一覧を JSON で表示します。

**次のリリース：** `--versions`、`--packages`、`-s`／`--skip-standard` を受け付けるようになり、`caddy list-modules` 向けに書かれたスクリプトがそのまま動きます。

```bash
pingclair list-modules [--json]
```

## pingclair build-info

ビルドのメタデータ（バージョン、ターゲット、バイナリを生成したツールチェーン）を表示します。ビルドを正確に特定できるため、不具合を報告する際に役立ちます。

```bash
pingclair build-info
```

## pingclair manpage

man ページを、あらかじめ存在するディレクトリに書き出します。フラグは必須なので、誤ってカレントディレクトリに書き込まれることはありません。

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

証明書ストアを tar アーカイブに書き出します。対象のストアは `PINGCLAIR_TLS_STORE` で指定したもの、指定が無ければコマンドを実行したユーザーのデータディレクトリです。例の接頭辞は、root のシェルが root 自身のストアではなくサービスアカウントのストアを参照するようにしています。`-o -` はアーカイブを標準出力に書き出します。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

アーカイブには秘密鍵が含まれるため、モード `600` で書き込まれます。バケットに送られるバックアップではなく、暗号化されたメディアに保管してください。何が含まれ、いつ移すべきかは [TLS ガイド](/ja/guides/tls-tuning/)で説明しています。

## pingclair storage-import

`storage-export` が書き出したアーカイブからストアを復元します。`-i -` はアーカイブを標準入力から読み込みます。

**次のリリース：** 両方のコマンドが `-c`／`--config <file>` を受け付け、そのファイル内のグローバルの `storage file_system <path>` オプションがストアを指定します。何も復元しないことになるインポートは拒否されます。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

内部認証局（`tls internal`）のルート証明書をシステムの信頼ストアに追加します。以降、その信頼ストアを使うクライアントは、この認証局が発行した証明書を受け入れます。ルートは `PINGCLAIR_TLS_STORE` で指定したストアから読み込まれます。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

これが必要になる場面と、うまくいったことの確認方法は [HTTPS](/ja/start/https/) のページで説明しています。

## pingclair untrust

そのルート証明書をシステムの信頼ストアから取り除きます。発行済みの証明書はディスクに残りますが、クライアントはそれらを信頼しなくなります。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

すべてのリクエストに、1 つの固定のレスポンス（ステータス、ヘッダー、ボディ）を返します。開発用、そして常に同じ応答を返すオリジンに対してクライアントをテストするためのものです。

```bash
pingclair respond [OPTIONS]
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `-s`、`--status <STATUS>` | `200` | 返すステータスコード。 |
| `-H`、`--header <HEADERS>` | なし | `Field: value` 形式のレスポンスヘッダー。繰り返し指定できます。 |
| `-b`、`--body <BODY>` | 空 | レスポンスボディ。 |
| `-l`、`--listen <LISTEN>` | ループバックの任意のポート | 待ち受けるアドレス。 |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

`--listen` を指定しない場合は空いているループバックのポートが選ばれて表示されるため、2 つの開発用サーバーが 1 つのポートを奪い合うことはありません。

## pingclair reverse-proxy

設定ファイルなしで、リスナーを 1 つ以上のアップストリームにプロキシします。`--to` は必須で、繰り返すとリクエストを複数のアップストリームに分散します。設定ファイルを使った同じ内容は[リバースプロキシのガイド](/ja/guides/reverse-proxy/)で扱っています。

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 待ち受けるアドレス。 |
| `--to <TO>` | 必須 | アップストリームのアドレス。複数ある場合は繰り返します。 |
| `--header-up <HEADERS_UP>` | なし | アップストリームに送るリクエストヘッダー（`Field: value` 形式）。繰り返し指定できます。 |
| `--header-down <HEADERS_DOWN>` | なし | ダウンストリームに送るレスポンスヘッダー（`Field: value` 形式）。繰り返し指定できます。 |
| `--insecure` | オフ | アップストリームの TLS 証明書を検証しません。 |
| `--internal-certs` | オフ | 公開証明書を試さず、このリスナーの証明書を内部 CA から発行します。 |
| `--disable-redirects` | オフ | HTTP から HTTPS へのリダイレクト用リスナーを用意しません。 |
| `-c`、`--change-host-header` | オフ | Caddy と同じく、アップストリームへの `Host` ヘッダーをアップストリームのアドレスに書き換えます。 |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

設定ファイルなしで、ディレクトリを HTTP で配信します。

```bash
pingclair file-server [OPTIONS]
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 待ち受けるアドレス。 |
| `--root <ROOT>` | `.` | 配信するディレクトリ。 |
| `-b`、`--browse` | オフ | ディレクトリ一覧を表示します。 |
| `-d`、`--domain <DOMAIN>` | なし | このドメインを HTTPS で配信します。`--listen` はポートである必要があります。 |
| `--access-log` | オフ | リクエストごとにアクセスログを 1 行書き出します。 |
| `--no-compress` | オフ | レスポンスの圧縮を無効にします。 |
| `--file-limit <FILE_LIMIT>` | なし | ディレクトリ一覧に表示するファイル数の上限。 |
| `--templates` | オフ | Caddy と同じく、`.html` ファイルをテンプレートとして描画します。 |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

圧縮、キャッシュヘッダー、シングルページアプリケーションのフォールバックは設定ファイルに書くものです。[静的サイトのガイド](/ja/guides/static-site/)で扱っています。

## pingclair validate

何も起動せずに設定をコンパイルし、最初に見つかった問題を報告します。設定が拒否されると終了ステータスが 0 以外になるため、デプロイスクリプトの関門として使えます。

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 引数 | 既定値 | 働き |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`、次に `./Caddyfile` | 検査する設定ファイルまたはディレクトリ。 |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

Pingclairfile をコンパイルした JSON ドキュメントを表示します。これは Pingclair 独自のスキーマで、`validate`、`run`、Admin API の `/load` が受け付けるものです。`caddy adapt` と違い、出力は Caddy の `{"apps": …}` の形ではなく、Caddy では読み込めません。

`--pretty` は JSON をインデントします。`--validate` は、証明書ファイルが存在するかなど、`validate` が行う検査も実行します。

**次のリリース：** `adapt` は表示の前に必ず検証するようになり、終了ステータス 0 は、このビルドで結果を読み込めることを意味します。`--validate` は引き続き受け付けますが、何も変わりません。

```bash
pingclair adapt [OPTIONS]
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`、次に `./Caddyfile` | 読み込む設定ファイル。 |
| `-p`、`--pretty` | オフ | JSON をインデントします。 |
| `--validate` | オフ | `validate` が行う検査も実行します。 |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Pingclairfile を整形して結果を表示します。パスを指定しない場合は `./Pingclairfile` を読み、`-` は標準入力から読みます。

**次のリリース：** 入力が整形済みでなかった場合、`fmt` はステータス 1 で終了するようになり、`caddy fmt` と同じようにコミットの関門として使えます。`--overwrite` は引き続き 0 で終了します。Caddy の書き方である `--config <path>` と `-w` も受け付け、インデントは 2 スペースではなく 1 段につきタブ 1 つになります。

```bash
pingclair fmt [OPTIONS] [PATH]
```

| フラグ | 働き |
| --- | --- |
| `-o`、`--overwrite` | 整形した内容を表示せずにファイルに書き戻します。 |
| `-d`、`--diff` | 整形後のファイルではなく、視覚的な差分を表示します。 |

```bash
pingclair fmt --diff              # what would change
pingclair fmt --overwrite         # apply it
```

## pingclair hash-password

`basic_auth` ディレクティブ用のパスワードハッシュを生成します。`--plaintext` を省略するとパスワードは標準入力から読み込まれるため、シェルの履歴に残りません。

```bash
pingclair hash-password [OPTIONS]
```

| フラグ | 既定値 | 働き |
| --- | --- | --- |
| `-p`、`--plaintext <PLAINTEXT>` | 標準入力から読み込み | ハッシュするパスワード。 |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` または `argon2id`。 |
| `--bcrypt-cost <COST>` | `14` | bcrypt のコスト（4〜31）。大きいほど遅く、強くなります。 |
| `--argon2id-time <TIME>` | `1` | argon2id の反復回数。 |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id のメモリコスト（KiB）。 |
| `--argon2id-threads <THREADS>` | `4` | argon2id の並列度。 |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id の出力長（バイト）。 |

```bash
pingclair hash-password --algorithm argon2id
```

出力をディレクティブに貼り付けてください。前後の構文は [`basic_auth` の項目](/ja/reference/directives/#basic_auth)に示しています。

## pingclair version

バージョンを表示します。リリース候補であれば `v0.2.0-rc.3` のように表示されます。

```bash
pingclair version
```

## pingclair service

インストーラが書き出した systemd ユニットを操作します。`systemctl` のラッパーなので、どちらを使っても構いません。このサブコマンドがあることで、ユニットの操作を他のコマンドと同じ場所で行えます。

```bash
pingclair service <start|stop|restart|reload|status>
```

| サブコマンド | 働き |
| --- | --- |
| `start` | ユニットを起動します。 |
| `stop` | ユニットを停止します。 |
| `restart` | ユニットを再起動します。リスナーやプロセス全体に関わるオプションを変更したときに必要です。 |
| `reload` | 実行中のサーバーに、シグナルで設定ファイルの再読み込みを求めます。結果はこのコマンドの終了コードではなく、ユニットのステータス行とジャーナルに出ます。 |
| `status` | ユニットの状態を表示します。 |

systemd のある Linux でのみ動作し、それ以外のプラットフォームでは実行を拒否します。ユニットそのものは[サービスとして動かす](/ja/start/service/)で説明しています。

## 🧾 これらのオプションの出どころ

コマンドラインはサーバーのソースの 1 つのファイル、`pingclair/src/cli/mod.rs` で定義されており、このページはその順序に従っています。そこでコマンドのフラグが変われば、このページも合わせて変わります。
