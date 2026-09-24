---
title: 静的サイトを配信する
h1_emoji: '🗂️'
sidebar:
  order: 2
description: 圧縮、キャッシュヘッダー、バイトレンジ、シングルページ用のフォールバック、そしてドットファイルを非公開に保つ規則を備えて、ディレクトリを配信します。
---

このページでは、`root` と `file_server` から始めて、圧縮、キャッシュヘッダー、レンジリクエスト、そしてシングルページアプリケーションに必要なフォールバックを加えながら、ファイルのディレクトリを配信します。各手順には、実際のホストでサーバーが返した応答を示しています。

📌 このページは最新の公開リリースである **v0.2.0-rc.3** を対象にしています。サーバーの `main` ブランチにしかない変更には **次のリリース** と記しています。

## 🧾 はじめる前に

- Pingclair がインストールされて動いていること（[インストール](/ja/start/install/)）。試している間はサービスを止めておきます：`sudo pc service stop`。
- 配信するディレクトリ。例では `/srv/site` を使います。

## 📁 ディレクトリを配信する

```caddyfile
http://:8080 {
    root * /srv/site
    file_server
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo systemctl restart pingclair
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Last-Modified: Tue, 22 Sep 2026 04:37:54 GMT
ETag: "5e-6ab20622"
Accept-Ranges: bytes
```

`root *` はすべてのリクエストに対してサイトのルートを設定し、`file_server` はそこからファイルを配信します。存在しないパスには `404` を返します。

## 🗜️ 圧縮

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

`encode` は形式を優先順に並べます。同じ 36 KB のテキストファイルを、3 種類の `Accept-Encoding` ヘッダーで要求した結果です。

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

プロキシしたレスポンスには Brotli が実装されておらず、それを要求すると、黙って格下げされるのではなくコンパイルエラーになります。

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

メッセージは代替案を示します。サーバーにできないことを求める設定は、まったく実行されません。

v0.2.0-rc.3 では、`encode` 行の無いサイトでも gzip で圧縮されます。ディスク上のバイトをそのまま配信するには `encode off` と書いてください。**次のリリース：** Caddy と同じく、サイトは `encode` で指定した場合にだけ圧縮するようになります。アップグレードの際は `encode` 行を残してください。

## ⏳ キャッシュヘッダー

`file_server` は `ETag` と `Last-Modified` を送りますが、v0.2.0-rc.3 では `If-None-Match` や `If-Modified-Since` を評価しません。再検証するクライアントは、ファイル全体をもう一度ダウンロードします。**次のリリース：** 条件付きリクエストには `304 Not Modified` または `412 Precondition Failed` で応答します。

クライアントがファイルをどれだけの期間保持してよいかはサイトが決めることであり、それが当てはまるパスに設定します。

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    header Cache-Control "public, max-age=60"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    file_server
}
```

実測では、ページには `Cache-Control: public, max-age=60`、`/assets/*` には `public, max-age=31536000, immutable` が付きました。`immutable` が安全なのは、内容が変わるたびにファイル名も変わる場合に限られます。ビルドツールがアセット名にコンテンツハッシュを付けるのはそのためです。

レンジリクエストに設定は不要です。先頭の 10 バイトを求めたクライアントは、その 10 バイトを受け取ります。

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 シングルページアプリケーション

ブラウザー側でルーティングするアプリケーションでは、実在するファイルはそのまま配信しつつ、未知のパスにはすべてエントリードキュメントを返す必要があります。

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

実測では、`/assets/big.txt` は引き続き自身の内容で `200` を返し、`/some/spa/route` は `index.html` で `200` を返しました。`try_files` 行が無いと、2 つ目のリクエストは `404` になります。

## 🗂️ ディレクトリ一覧

`file_server browse` は、インデックスファイルの無いディレクトリに一覧を表示します。

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

一覧にはエントリーの名前が並びます。`/assets/` では `Index of` という見出しの下に `big.txt` が表示されます。ディレクトリをそのように読ませる意図が無い限り、`browse` は付けないでください。

## 🔒 ファイルを隠す

⚠️ ドットファイルは他のファイルと同じように配信されます。上の設定では `.hidden` に `200` が返りました。`.git`、`.env`、エディターのバックアップがインターネットに流出するのはこのためです。これらを隠すには、ファイルサーバーより先にそのパスに応答します。

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

実測では、`/.hidden` は `404` を返し、`/` と `/assets/big.txt` は引き続き `200` を返しました。ステータスを `403` ではなく `404` にしているのは意図的です。`403` はファイルが存在することを認めてしまいます。`/.*` がマッチするのはサイト最上位のドットファイルだけです。場所を問わずパスを隠すには `file_server { hide … }` オプションを使います。

## ⚠️ うまくいかないとき

- **`Unsupported feature: 'encode br'`。** Brotli は名前を挙げて拒否されます。`encode zstd gzip` を使ってください。
- **`Unknown directive 'file_server: …'`。** そのオプションは存在しません。`validate` は無視せずに、拒否した綴りを示します。
- **ページの代わりにディレクトリ一覧が表示される。** ディレクトリに `index.html` がありません。それが意図どおりか、ファイルが欠けているかのどちらかです。
- **アプリケーションが扱うルートで `404` が返る。** シングルページ用のフォールバックがありません：`try_files {path} /index.html`。
- **再読み込みしても変更が現れない。** ファイルはリクエストごとに読まれるため、新しいファイルは再読み込みしなくてもすぐに現れます。リスナーの追加や移動には再起動が必要です（[サービスとして動かす](/ja/start/service/#-再読み込みの意味)）。

## 🧭 次の手順

- [アプリケーションをプロキシする](/ja/guides/reverse-proxy/)：サーバーのもう半分。
- [`file_server`](/ja/reference/directives/#file_server)：ディレクティブリファレンス。
- [Pingclairfile](/ja/reference/pingclairfile/)：マッチャーとルートの順序。
