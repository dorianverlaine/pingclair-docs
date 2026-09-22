---
title: 静的サイトを配信する
h1_emoji: '🗂️'
sidebar:
  order: 2
description: ディレクトリを圧縮、キャッシュヘッダー、部分取得、シングルページ用フォールバック、そしてドットファイルを公開しない規則とともに配信します。
---

ファイルの配信は Pingclair の仕事のもう半分です。このページは `root` と
`file_server` から始めて、圧縮、キャッシュヘッダー、部分取得、シングルページ
アプリケーションに必要なフォールバックまで組み立て、各段階でサーバーが実際に何を
返すかを示します。

## 🧾 はじめる前に

- Pingclair が導入され動いていること（[インストール](/ja/start/install/)）。実験中は
  サービスを停止します: `sudo pc service stop`。
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

`root *` はすべてのリクエストに対するサイトのルートを設定し、`file_server` が
そこから配信します。存在しないパスは `404` を返します。

## 🗜️ 圧縮

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

引数は優先順です。同じ 36 KB のテキストファイルを 3 種類の `Accept-Encoding` で
要求した、この構成での実測:

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli はプロキシ応答には実装されておらず、要求すると静かな降格ではなく
コンパイルエラーになります。

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

メッセージが代替を示します。サーバーが果たせないことを要求する設定は、そもそも
実行されません。

## ⏳ キャッシュヘッダー

`file_server` はすでに条件付きリクエストに応答します。上の `ETag` と
`Last-Modified` は、クライアントが `If-None-Match` や `If-Modified-Since` で返す
値です。保持期間はあなたが決めるもので、それが真になるパスに置きます。

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

実測: ページは `Cache-Control: public, max-age=60`、`/assets/*` は
`public, max-age=31536000, immutable`。immutable が正直なのは、ファイル名が内容と
ともに変わる場合だけです。だからビルドツールは名前にハッシュを足します。

部分取得に設定は要りません。先頭 10 バイトを求めたクライアントはそれを受け取り
ます。

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 シングルページアプリケーション

ブラウザ側でルーティングするアプリケーションは、未知のパスすべてで入り口の
文書を返す必要があります。実在するファイルはそのまま配信されます。

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

実測: `/assets/big.txt` は自分の内容で `200` を返し続け、`/some/spa/route` は
`index.html` で `200` を返します。`try_files` の行が無いと、2 番目は `404` です。

## 🗂️ ディレクトリ一覧

`file_server browse` は index ファイルの無いディレクトリの一覧を表示します。

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

一覧は項目名を並べるので、`/assets/` は `Index of` の見出しとともに `big.txt` を
表示します。そのように読ませたいディレクトリでなければ `browse` は付けません。

## 🔒 ファイルを隠す

⚠️ ドットファイルは他のファイルと同じように配信されます。上の構成で `.hidden` は
`200` を返しました。`.git`、`.env`、エディタのバックアップがインターネットに出る
のはこの経路です。除外するには、ファイルサーバーが動く前に応答します。

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

実測: `/.hidden` は `404`、`/` と `/assets/big.txt` は `200` のまま。`403` ではなく
`404` なのは意図的です。`403` はファイルの存在を肯定してしまいます。

## ⚠️ うまくいかないとき

- **`Unsupported feature: 'encode br'`。** Brotli は名前を挙げて拒否されます。
  `encode zstd gzip` を使います。
- **`Unknown directive 'file_server: …'`。** そのオプションは存在せず、`validate`
  は黙って無視せず拒否した綴りを示します。
- **ページではなくディレクトリ一覧が出る。** そのディレクトリに `index.html` が
  ありません。望んだ結果か、ファイルの置き忘れです。
- **アプリケーションが扱うルートで `404`。** シングルページのフォールバックが
  ありません: `try_files {path} /index.html`。
- **再読み込みしても新しいページが出ない。** 再読み込みが適用するのはポリシーで、
  新しいリスナーではありません。ファイルはリクエストごとに読まれるので、ファイル
  追加は即時で、リスナーの移動はそうではありません
  （[サービスとして動かす](/ja/start/service/#-再読み込みの意味)）。

## 🧭 次の手順

- [アプリケーションをプロキシする](/ja/guides/reverse-proxy/): サーバーのもう半分。
- [`file_server`](/ja/reference/directives/#file_server): ディレクティブの
  リファレンス。
- [`try_files`](/ja/reference/pingclairfile/): フォールバックがどうコンパイルされる
  か。
