---
title: クイックスタート
h1_emoji: '🏃'
sidebar:
  order: 2
description: 最初の Pingclairfile を書き、検証し、フォアグラウンドまたはバックグラウンドで起動して、実際のディレクトリを配信します。
---

このページは、導入済みのホストから自分で制御できるサーバーまで進みます。ディスク
上の設定、検証済みのコンパイル、起動・停止・監視できるサーバー、そしてファイル
サーバーが応答したことを示す確認です。[インストール](/ja/start/install/) が済んで
いることを前提にします。

## 🧾 はじめる前に

インストーラはポート 80 でサービスを動かしたままにしており、そのサービスが
`/etc/Pingclair/Pingclairfile` の設定を握っています。試している間は停止して
ポートを空けます。

```bash
sudo pc service stop
```

```bash
mkdir -p ~/demo/public
cd ~/demo
echo '<h1>hello from ~/demo/public</h1>' > public/index.html
```

## 1. ✍️ 設定を書く

`~/demo/Pingclairfile` を作ります。

```caddyfile
{
    admin 127.0.0.1:2019
}

http://localhost:8080 {
    file_server ./public
}
```

三点だけ名前を付けておきます。先頭の無名ブロックはグローバルオプションで、
`admin` があると `pingclair start`、`stop`、`reload` が実行中のサーバーと話せ
ます。サイトアドレスはスキームを含み、`http://` が平文を強制します。これが
無いと Pingclair は `localhost` を名前として扱い、独自の認証局で HTTPS を
提供するため、平文の HTTP クライアントには空の応答として見えます
（[HTTPS](/ja/start/https/)）。`file_server` のルートは作業ディレクトリからの
相対パスです。

## 2. ✅ 実行前に検証する

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` は既定で `./Pingclairfile` を読み、`./Caddyfile` も検出します。設定を
コンパイルし、証明書パスの有無といった意味的な検査を適用します。検証は助言では
ありません。失敗した設定は実行されず、最後の行に理由が出ます。

## 3. 🧭 設定が何になるかを読む

```bash
pingclair adapt --pretty
```

```text
{
  "debug": false,
  "servers": [
    {
      "name": "localhost",
      "names": [
        "localhost"
      ],
      "listen": [
        "[::]:8080"
      ],
```

コンパイル済みの JSON はサーバーが実際に実行する形です。ディレクティブが
ドキュメントどおりに動かないとき、最初に見る場所がここです。代わりに
`pingclair fmt` がファイルに加える変更を見るには次のようにします。

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` は正規形を出力し、インデントは 2 スペースになります。

## 4. 🚀 起動する

ログが端末に残るフォアグラウンドで実行します。

```bash
pingclair run Pingclairfile
```

```text
🚀 Starting Pingclair with config: Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: Pingclairfile
🔧 Configured 1 server(s)
🔐 Auto HTTPS: enabled
```

`--watch` を付けると保存のたびに設定が再読み込みされ、開発ループになります。

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

シェルから切り離してバックグラウンドで動かすこともできます。

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`、`stop`、`reload` は Admin API 経由で実行中のサーバーに
到達します。上の設定に `admin` があるのはそのためです。`pingclair run` には
必要ありません。

## 5. 🔍 確認する

```bash
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 34
Last-Modified: Tue, 22 Sep 2026 03:26:39 GMT
ETag: "22-6ab1f56f"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag` と `Last-Modified` はファイルサーバーがディスクから読んだ証拠です。本文は
`public/index.html` です。バックグラウンドのサーバーを止めるには次のように
します。

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ コマンド一発のサーバー

三つのサブコマンドは設定ファイルなしで配信します。試したいときや使い捨ての
ホストで便利です。

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

それぞれ起動時にリスナーを表示します。

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

`:8082` へのリクエストは `:8081` のファイルサーバーへ転送され、`:8083` は渡した
本文をそのまま返します。`respond` は開発専用です。

## 🔁 サービスに任せる

サービスは `/etc/Pingclair/Pingclairfile` を実行するので、そこに置くと再起動
後も生き残ります。

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

先に検証します。`pc service reload` が成功を報告するのは信号が届いたときで、
サーバーが設定を受け入れたときではありません。設定を拒否したサーバーは、拒否を
ログに残さずに前の設定を動かし続けます。真実を教えてくれるのは検証コマンドだけ
です。

## ⚠️ うまくいかないとき

- **`Address already in use`。** インストーラのサービスがまだ `:80` を握って
  いるか、別のプロセスがそのポートを握っています。
  `sudo ss -ltnp | grep :80` が持ち主を表示し、`sudo pc service stop` が既定の
  サービスを解放します。
- **`http://localhost:8080` で `Empty reply from server`。** 平文で TLS の
  リスナーに話しかけています。サイトアドレスに `http://` を付けるか、内部
  証明書を信頼したうえで `https://` で話しかけます。
- **`Cannot reach admin API at 127.0.0.1:2019`。** 設定に `admin` が無く、
  `pingclair stop` と `pingclair reload` を受け取る相手がいません。グローバル
  オプションのブロックに追加するか、フォアグラウンドのプロセスを Ctrl-C で
  止めます。
- **`curl` がループバックで固まる。** システムのプロキシが要求を横取りして
  います。`curl --noproxy '*'` を付けて再実行します。
- **検証が `Unsupported feature` で失敗する。** ディレクティブは認識されて
  いますが実装が無く、メッセージが代替を示します。`encode br` の場合、
  プロキシ応答に Brotli は実装されていないため `encode zstd gzip` を指します。

## 🧭 次の手順

- [HTTPS](/ja/start/https/): 公開名に対する証明書を Let's Encrypt か内部認証局
  から。
- [サービスとして動かす](/ja/start/service/): ユニット、再読み込みの意味、
  ログ。
- [Pingclairfile](/ja/reference/pingclairfile/): 言語そのもの。マッチャー、
  スニペット、インポート。
