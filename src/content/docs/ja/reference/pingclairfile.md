---
title: Pingclairfile
h1_emoji: '📖'
description: Pingclairfile の構造。字句規則、サイトアドレス、マッチャー、ルートの順序、スニペット、そして設定を検査するツール。
---

Pingclairfile は Pingclair の設定ファイルで、Caddyfile の言語で書きます。省略可能なグローバルオプションのブロックに続いて、サイトごとに 1 つのブロックがあり、それぞれがディレクティブを持ちます。対応しているディレクティブだけを使う Caddyfile は、そのまま読み込めます。このページでは言語そのものを説明します。各ディレクティブが何をするかは[ディレクティブリファレンス](/ja/reference/directives/)で説明しています。

📌 このページは最新の公開リリースである **v0.2.0-rc.3** を対象にしています。

## 🔤 字句規則

| 規則 | 詳細 |
| --- | --- |
| コメント | `#` から行末まで。 |
| 引用符 | 空白を含む値は `"` で囲みます。引用符は値を解析する前に取り除かれます。 |
| 期間 | 単位を付けて書きます：`30s`、`5m`、`1h`。期間が必要な箇所に単位の無い数値を書くと拒否されます。 |
| 大文字と小文字 | ディレクティブ名とオプション名は小文字です。 |
| プレースホルダー | `{host}`、`{path}`、`{args[0]}`、`{block}` などのプレースホルダーは、ディレクティブがそう定めている箇所で展開されます。 |

## 🌐 アドレス

サイトブロックにはアドレスで名前を付けます。アドレスによって、サイトが待ち受けるポートと、HTTPS で配信するかどうかが決まります。

```text
example.com {          # HTTPS on 443 with a public certificate; 80 redirects
example.com:8443 {     # HTTPS on 8443: a host with a port is still HTTPS
localhost:8080 {       # HTTPS on 8080, from the internal authority
:8080 {                # plaintext HTTP on 8080, for any host
http://example.com {   # plaintext HTTP on 80
```

スキームの無い、ポート付きのホストは、Caddy と同じく HTTPS で配信されます。どのポートでも平文にしたい場合は、アドレスの前に `http://` を書きます。ポートを共有する 2 つのサイトは TLS について一致している必要があり、そうでなければ設定は拒否されます。

## 🧭 マッチャー

マッチャーは、ディレクティブの適用を一部のリクエストに限定します。`/api/*` のようなパスとしてその場に書くか、`@name` として一度宣言してその名前で参照します。

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` ブロックはディレクティブを 1 つのルートにまとめます。実行されるのは最初にマッチした `handle` だけで、マッチャーの無い `handle` はサイトのフォールバックになります。

`client_ip` は、`trusted_proxies` を適用した後のクライアントのアドレスにマッチします。**次のリリース：** `remote_ip` は Caddy と同じく、代わりに接続そのもののピアにマッチします。v0.2.0-rc.3 では、どちらも転送されたクライアントにマッチします。

## 🧭 どのルートが応答するか

v0.2.0-rc.3 では、複数のルートがリクエストにマッチしたとき、どこに書かれていても、最も具体的なパスを持つルートが応答します。

**次のリリース：** ルートは Caddy のディレクティブ順序で試され、最初にマッチしたものが応答します。たとえば `respond` は `file_server` より上位なので、次のサイトでは `/assets/a.txt` にファイルではなく `hello` が返ります。

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

狭いルートを優先させ続けるには、ルートを `handle` ブロックで囲むか、グローバルの `order` オプションでディレクティブの順位を動かすか、書いた順序を保つ `route` ブロックにルートを並べます。

## 🧩 スニペットとインポート

スニペットは再利用可能な断片です。`(name) { ... }` として宣言したスニペットは `import name` で取り込まれ、呼び出し側からブロックを受け取ることができます。

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

`{args[0]}` はスニペット名の後の最初の引数で、`{block}` は呼び出し側が渡すブロックです。呼び出し側がブロックを渡さない場合、`{block}` は何にも展開されず、スニペットはそのままコンパイルできます。

## 🧰 コマンドラインツール

設定を書く際に役立つコマンドが 3 つあります。

- `pingclair validate` はファイルをコンパイルし、最初に見つかった問題を示します。
- `pingclair adapt --pretty` は、ファイルのコンパイル結果である JSON を表示します。
- `pingclair fmt` はファイルを整形します。

すべてのサブコマンドとフラグは[コマンドライン](/ja/reference/command-line/)に一覧があります。

## 🚫 言語に含まれないもの

Caddyfile の言語は、Pingclair が実装しているより多くのディレクティブとオプションを定義しています。Pingclair が認識していても実装していない名前は、ファイルの読み込み時に、欠けている機能を示すメッセージとともに拒否されます。そのため、設定の一部が黙って落とされたまま動くことはありません。完全な一覧はサーバーリポジトリの README にあり、[プロジェクト状況](/ja/project/status/)に概要をまとめています。
