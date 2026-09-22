---
title: コマンドライン
h1_emoji: '⌨️'
description: バイナリが公開するすべてのサブコマンドを、フラグ・既定値・前提条件とともに `pingclair --help` と突き合わせて説明します。
---

Pingclair は単一のバイナリとして配布され、コマンドラインは Unix の慣例どおり
次の形を取ります。

```bash
pingclair <command> [<args…>]
```

山かっこは必須、角かっこは任意、`…` は繰り返せる値を表します。どのコマンドも
`--help` に、このページを書くときに使ったのと同じテキストを返し、
`pingclair help <command>` も同じものを表示します。コマンドなしで実行すると
一覧が出ます。

インストーラはバイナリを `pc` としてもリンクするので、以下のコマンドにはすべて
2 文字の綴りがあります: `pc validate`、`pc service reload` など。どちらも同じ
プログラムで、`pc` はシンボリックリンクであり 2 つ目のバイナリではありません。

## 🚩 グローバルフラグ

| フラグ | 効果 |
| --- | --- |
| `-v`, `--verbose` | この実行のログ水準を `debug` に上げます。コマンドの前後どちらでも受け付けます。 |
| `-h`, `--help` | そのフラグが付いたコマンドのヘルプを表示します。 |
| `-V`, `--version` | バージョンを表示します。トップレベル専用です。 |

## 🧭 コマンド一覧

| コマンド | 効果 |
| --- | --- |
| `run` | サーバーをフォアグラウンドで実行します。 |
| `reload` | 編集した設定を Admin API 経由で適用し、サーバーがどう判断したかを報告します。 |
| `start` | 切り離されたサーバーのコピーを起動します。 |
| `stop` | 実行中のサーバーを Admin API 経由で停止します。 |
| `completion` | シェルの補完スクリプトを出力します。 |
| `environ` | サーバーが見る環境を出力します。 |
| `list-modules` | このバイナリに組み込まれたモジュールを一覧します。 |
| `build-info` | ツールチェーンを含むビルド情報を出力します。 |
| `manpage` | man ページをディレクトリに書き出します。 |
| `storage-export` | 証明書ストアを tar アーカイブに移します。 |
| `storage-import` | そのアーカイブからストアを復元します。 |
| `trust` | 内部 CA のルートをシステムのトラストストアに導入します。 |
| `untrust` | それを取り除きます。 |
| `respond` | 開発用に固定の応答を返します。 |
| `reverse-proxy` | 設定ファイルなしでアップストリームへプロキシします。 |
| `file-server` | 設定ファイルなしでディレクトリを配信します。 |
| `validate` | 設定をコンパイルし、どこが問題かを報告します。 |
| `adapt` | Pingclairfile がコンパイルされる JSON を出力します。 |
| `fmt` | Pingclairfile を整形します。整形で何が変わるかの表示もできます。 |
| `hash-password` | `basic_auth` 用のパスワードハッシュを作ります。 |
| `version` | バージョンを表示します。 |
| `service` | 導入された systemd ユニットを操作します。 |

## pingclair run

1 つの設定ドキュメントでサーバーをフォアグラウンド実行します。ログは標準出力と
標準エラーに流れ、`Ctrl-C` で停止します。

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 引数 | 既定 | 効果 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`、次に `./Caddyfile` | 読み込む設定ファイルまたはディレクトリ。 |

| フラグ | 効果 |
| --- | --- |
| `-r`, `--resume` | `caddy run --resume` と同様に、Admin API が最後に自動保存した設定を読み込みます。両方ある場合は `CONFIG` を上書きします。 |
| `-w`, `--watch` | 設定ファイルを監視し（mtime を 1 秒ごとに確認）、変更のたびにプロセスへ再読み込み信号を送ります。ローカル開発向けで、拒否された編集がすぐ見えます。 |

```bash
pingclair run --watch
```

ターミナルより長く生きるサーバーには、導入されたユニット
（[サービスとして動かす](/ja/start/service/)）か
[クイックスタート](/ja/start/quickstart/) を使ってください。後者は同じコマンドを
サービスとして順に説明しています。

## pingclair reload

編集した設定を Admin API 経由で実行中のサーバーに適用します。応答するのは
サーバー自身なので、このコマンドはファイルをどう判断したかを報告します。信号の
場合は systemd が確認できるのは配達だけであり、そこが違います。

```bash
pingclair reload [OPTIONS]
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`、次に `./Caddyfile` | 適用する設定ファイル。 |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API のアドレス。 |

Admin API が動いている必要があります。グローバルオプションの `admin` が有効に
し、そのオプションが無い設定には到達できるエンドポイントがありません。実行中の
サーバーが適用できない再読み込み——リスナー構成の変更が典型です——は、以前の
設定をサービスしたままにします。

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

シェルが終了しても残るサーバーのコピーを、サービス管理機構なしで起動します。

```bash
pingclair start [OPTIONS]
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`、次に `./Caddyfile` | 読み込む設定ファイル。 |

プロセスは端末から切り離され、出力は捨てられるので、どこにも記録が残りません。
systemd のあるホストでは導入されたユニットのほうが適しています。ログを捕まえ、
失敗時に再起動し、リスナーがバインドされた時点を把握します。
[サービスとして動かす](/ja/start/service/) を参照してください。

## pingclair stop

実行中のサーバーを Admin API 経由で停止します。Admin API が公開している
`POST /stop` と同じです。`reload` と同様に `admin` オプションが必要です。

```bash
pingclair stop [OPTIONS]
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API のアドレス。 |

## pingclair completion

1 つのシェル向けの補完スクリプトを出力します。受け付ける名前は引数が取るものと
同じです: `bash`、`zsh`、`fish`、`powershell`、`elvish`。

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

サーバーが実行される環境を出力します。`PINGCLAIR_TLS_STORE` のような値を、
起動後の失敗から推測するのではなく、起動前に確認できます。

```bash
pingclair environ
```

## pingclair list-modules

このバイナリに組み込まれたモジュールと機能を一覧します。`--json` は同じ一覧を
スクリプト向けの構造化出力にします。

```bash
pingclair list-modules [--json]
```

## pingclair build-info

ビルド情報を出力します: バージョン、ターゲット、そしてそのバイナリを生成した
ツールチェーン。不具合を報告するときに、どのビルドかを特定できるので役立ちます。

```bash
pingclair build-info
```

## pingclair manpage

既に存在するディレクトリに man ページを書き出します。フラグは必須なので、現在の
ディレクトリに誤って書き込まれることはありません。

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

`PINGCLAIR_TLS_STORE` が指す証明書ストアを tar アーカイブに書き出します。出力先に
`-` を指定すると標準出力に書きます。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

アーカイブには秘密鍵が入るので、モード `600` で書かれ、バケットへ送るバックアップ
ではなく暗号化された媒体に置くべきものです。何を含むか、いつ移動するかは
[TLS ガイド](/ja/guides/tls-tuning/) にあります。

## pingclair storage-import

`storage-export` が書いたアーカイブからストアを復元します。`-` はアーカイブを標準
入力から読みます。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

内部 CA のルート証明書をシステムのトラストストアに導入します。以後、ブラウザと
コマンドラインのクライアントはその認証局が発行する証明書を受け入れます。CA は
`PINGCLAIR_TLS_STORE` が指すストアから読みます。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

いつ必要か、そしてうまくいったかをどう確かめるかは
[HTTPS](/ja/start/https/) にあります。

## pingclair untrust

そのルート証明書をシステムのトラストストアから取り除きます。既に発行された
証明書のファイルは残りますが、クライアントは信頼しなくなります。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

固定の応答——ステータス、ヘッダー、本文——を返します。開発用と、いつも同じように
答えるオリジンに対してクライアントを試す用途のためのものです。

```bash
pingclair respond [OPTIONS]
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | 返すステータスコード。 |
| `-H`, `--header <HEADERS>` | なし | `Field: value` 形式の応答ヘッダー。繰り返し可能。 |
| `-b`, `--body <BODY>` | 空 | 応答本文。 |
| `-l`, `--listen <LISTEN>` | ランダムなループバックポート | 待ち受けアドレス。 |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

`--listen` を省略するとポートは選ばれて表示されるので、開発用サーバーが固定
ポートを取り合うことがありません。

## pingclair reverse-proxy

設定ファイルを書かずに、待ち受けから 1 つ以上のアップストリームへのプロキシを
起動します。[リバースプロキシガイド](/ja/guides/reverse-proxy/) の一行版で、
おもちゃではなく本番の形をした設定を配信します。アップストリームは必須で、
複数の `--to` は負荷分散します。

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 待ち受けアドレス。 |
| `--to <TO>` | 必須 | アップストリームのアドレス。複数回指定できます。 |
| `--header-up <HEADERS_UP>` | なし | アップストリームへ送る要求ヘッダー（`Field: value`）。繰り返し可能。 |
| `--header-down <HEADERS_DOWN>` | なし | 下流へ送る応答ヘッダー（`Field: value`）。繰り返し可能。 |
| `--insecure` | 無効 | アップストリームの証明書が一致しないときに TLS 検証を省きます。 |
| `--internal-certs` | 無効 | このリスナーの証明書を、公開証明書を試す代わりに内部 CA から発行します。 |
| `--disable-redirects` | 無効 | HTTP から HTTPS へのリダイレクト用リスナーを用意しません。 |
| `-c`, `--change-host-header` | 無効 | Caddy と同様に、アップストリームの `Host` ヘッダーをアップストリームのアドレスに書き換えます。 |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

設定ファイルなしでディレクトリを HTTP で配信します。

```bash
pingclair file-server [OPTIONS]
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 待ち受けアドレス。 |
| `--root <ROOT>` | `.` | 配信するディレクトリ。 |
| `-b`, `--browse` | 無効 | ディレクトリ一覧を表示します。 |
| `-d`, `--domain <DOMAIN>` | なし | このドメインを HTTPS で配信します。`--listen` がポートである必要があります。 |
| `--access-log` | 無効 | リクエストごとにアクセス行を書きます。 |
| `--no-compress` | 無効 | 応答の圧縮を無効にします。 |
| `--file-limit <FILE_LIMIT>` | なし | ディレクトリ一覧に表示するファイル数の上限。 |
| `--templates` | 無効 | Caddy と同様に `.html` をテンプレートとして描画します。 |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

圧縮、キャッシュヘッダー、シングルページアプリケーションのフォールバックは設定
ファイルの仕事です。[静的サイトガイド](/ja/guides/static-site/) が扱っています。

## pingclair validate

何も起動せずに設定をコンパイルし、最初に見つかった問題を報告します。設定が拒否
されると終了コードは非ゼロなので、パイプラインやデプロイ用のスクリプトでも
使えます。

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 引数 | 既定 | 効果 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`、次に `./Caddyfile` | 検査する設定ファイルまたはディレクトリ。 |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

設定がコンパイルされる JSON を出力します。`--pretty` は読みやすく字下げし、
`--validate` は構文だけでなくファイルシステムに関わる検査——証明書のパスなど
——も実行します。

```bash
pingclair adapt [OPTIONS]
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`、次に `./Caddyfile` | 読む設定ファイル。 |
| `-p`, `--pretty` | 無効 | JSON を字下げします。 |
| `--validate` | 無効 | 変換後のドキュメントが参照するものも検証します。 |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Pingclairfile を整形して結果を表示します。パスを省略すると `./Pingclairfile` を
読み、`-` は標準入力を読みます。

```bash
pingclair fmt [OPTIONS] [PATH]
```

| フラグ | 効果 |
| --- | --- |
| `-o`, `--overwrite` | 整形したテキストを表示せずファイルに書き戻します。 |
| `-d`, `--diff` | 整形後のファイルではなく視覚的な差分を表示します。 |

```bash
pingclair fmt --diff              # 何が変わるか
pingclair fmt --overwrite         # 適用する
```

## pingclair hash-password

`basic_auth` ディレクティブ用のパスワードハッシュを作ります。`--plaintext` を
省略するとパスワードは標準入力から読むので、シェルの履歴に残りません。

```bash
pingclair hash-password [OPTIONS]
```

| フラグ | 既定 | 効果 |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | 標準入力から読む | ハッシュ化するパスワード。 |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` または `argon2id`。 |
| `--bcrypt-cost <COST>` | `14` | bcrypt のコスト（4〜31）。高いほど遅く、強くなります。 |
| `--argon2id-time <TIME>` | `1` | argon2id の反復回数。 |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id のメモリコスト（KiB）。 |
| `--argon2id-threads <THREADS>` | `4` | argon2id の並列度。 |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id の出力長（バイト）。 |

```bash
pingclair hash-password --algorithm argon2id
```

出力をディレクティブに貼り付けてください。周囲の構文は
[`basic_auth`](/ja/reference/directives/#basic_auth) にあります。

## pingclair version

バージョンを表示します。リリース候補なら `v0.2.0-rc.3` のようになります。

```bash
pingclair version
```

## pingclair service

インストーラが書いた systemd ユニットを操作します。`systemctl` のラッパーなので
どちらでも同じで、ユニット向けのコマンドを他と同じ場所に置くために存在します。

```bash
pingclair service <start|stop|restart|reload|status>
```

| サブコマンド | 効果 |
| --- | --- |
| `start` | ユニットを起動します。 |
| `stop` | ユニットを停止します。 |
| `restart` | ユニットを再起動します。リスナーやプロセス全体のオプションを変えた場合はこれが必要です。 |
| `reload` | 実行中のサーバーに設定ファイルを読み直すよう信号で求めます。結果はユニットの status line とジャーナルにあり、このコマンドの終了コードにはありません。 |
| `status` | ユニットの状態を表示します。 |

systemd のある Linux 専用です。それ以外のプラットフォームでは、このコマンドは
ふりをせず拒否します。ユニット自体の説明は
[サービスとして動かす](/ja/start/service/) にあります。

## 🧾 これらのオプションの出どころ

コマンドラインはサーバー側の 1 つのファイル `pingclair/src/cli/mod.rs` で定義され、
上のページはその順序に従っています。各 `--help` に出るバージョンと、このページを
突き合わせたバージョンは同じです。コマンドのフラグが変われば、このページも一緒に
変わります。
