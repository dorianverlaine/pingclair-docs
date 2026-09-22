---
title: Pingclairfile
h1_emoji: '📖'
description: 設定言語そのもの。ファイル構造、アドレス、マッチャー、スニペット、ツール。
---

Pingclairfile は設定言語です。Caddyfile の慣習に従い、省略可能な global options ブロックと、ディレクティブを含む site block で構成されます。本ページは言語そのものを説明します。受け付けるディレクティブは[ディレクティブ一覧](/ja/reference/directives/)を参照してください。

## 🔤 字句規則

| 規則 | 内容 |
| --- | --- |
| コメント | `#` から行末まで。 |
| 引用 | 空白を含む値は `"` で囲みます。引用符は解析前に取り除かれます。 |
| 時間の長さ | 単位が必要です。`30s`、`5m`、`1h`。長さが求められる場所に裸の数値を書くと拒否されます。 |
| 大文字と小文字 | ディレクティブ名とオプション名は小文字です。 |
| プレースホルダー | `{host}`、`{path}`、`{args[0]}`、`{block}` などは、各ディレクティブが定めた位置で展開されます。 |

## 🌐 アドレス

Site block はアドレスで名前を付けます。アドレスはリスナーを決め、公開名であれば自動 HTTPS の適用可否も決めます。

```caddyfile
example.com {              # host: ports 443 and 80, automatic HTTPS
localhost:8080 {           # host and port
:8080 {                    # any host on this port
http://example.com {       # force plaintext
```

ポートはアドレスの一部であり、独立した `listen` ディレクティブではありません。そのためアドレスとリスナーが食い違うことはありません。

## 🧭 マッチャー

マッチャーを受け付けるディレクティブは、一致するリクエストにだけ適用されます。マッチャーは行内に書くか、`@name` として宣言して名前で参照します。

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` ブロックはルートごとにディレクティブをまとめます。マッチャーを伴わない `handle` はそのサイトのフォールバックです。

## 🧩 スニペットと import

スニペットは再利用可能な断片です。`(name) { ... }` で宣言し、`import name` で取り込み、呼び出し側からブロックを受け取ることもできます。

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

何も渡されなかったプレースホルダーは何も挿入しないため、`{block}` を書いたスニペットは、呼び出し側がブロックを渡さなくてもコンパイルできます。

## 🧰 コマンドラインツール

コマンドラインには専用のリファレンスがあります。
[コマンドライン](/ja/reference/command-line/) がすべてのサブコマンドを、その
フラグと既定値とともに一覧します。設定を書くときに使うのはそのうちの三つです。
`pingclair validate` はファイルをコンパイルして最初の問題を名指しし、
`pingclair adapt --pretty` はそのファイルがコンパイルされる JSON を出力し、
`pingclair fmt` はそれを整形します。

## 🚫 言語に含まれないもの

形式が定義する名前は、サーバーが実装している数より多くなっています。認識されるが実装がない名前は、読み込み時に名前を挙げて拒否され、「機能が存在しない」と伝えます。権威ある一覧はサーバーリポジトリの README にあり、[プロジェクト状況](/ja/project/status/)ページが主要な分類をまとめています。
