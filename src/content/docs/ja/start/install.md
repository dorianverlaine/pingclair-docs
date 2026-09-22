---
title: インストール
h1_emoji: '📦'
sidebar:
  order: 1
description: Linux ホストにリリースバイナリ、Docker、またはソースから Pingclair を導入し、サービスが応答することを確認します。
---

Pingclair は単一の Linux バイナリとして配布されます。このページでは導入し、
インストーラが何を残したかを示し、サーバーが応答することを確認します。現在の
リリースは **v0.2.0-rc.3**（リリース候補）で、このサイトの全ページがその
リリースを説明しています。

## 🧾 必要なもの

- `x86_64` または `aarch64` の Linux ホスト。どちらにもリリースバイナリが
  公開されています。
- `sudo` または root。インストーラは `/usr/local/bin`、`/etc/Pingclair`、
  `/var/lib/pingclair`、`/etc/systemd/system` に書き込みます。
- サービスとして動かす場合は `systemd`。ない場合は Docker か、フォアグラウンド
  での起動を使います（どちらも以下で扱います）。
- 公開証明書が必要なら、インターネットから 80 と 443 に到達できること
  （[HTTPS](/ja/start/https/)）。クラウドのインスタンスでは、プロバイダ側の
  ファイアウォールも開ける必要があります。

macOS でのソースビルドは開発用にサポートされます。macOS は出荷対象では
ありません。

## 📦 リリースバイナリからのインストール

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

スクリプトは GitHub のリリース API に最新タグを問い合わせ、導入しようとして
いるタグを表示し、公開されているアーカイブの SHA-256 を検証して、一致しない
アーカイブを拒否します。続いてサービス用ユーザーを作成し、低いポートに
バインドする権限を与え、既定の設定を書き、ユニットを導入してサービスを
開始します。最後まで進むと次のように終わります。

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
Downloading https://github.com/dorianverlaine/pingclair/releases/download/v0.2.0-rc.3/pingclair-linux-x86_64.tar.gz...
pingclair-linux-x86_64.tar.gz: OK
Creating system user 'pingclair'...
Setting capabilities...
Configuring directories and assets...
Fetching default landing page...
Creating default Pingclairfile...
Installing Systemd service...
Creating 'pc' symlink...
✅ Installation Complete!
Use pc service status to check the service.
Config: /etc/Pingclair/Pingclairfile
```

未リリースの修正が必要なときは、リリースバイナリではなく `main` を導入します。

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main` はホスト上でクローンしてコンパイルします。Rust 1.98 以降と、
BoringSSL と jemalloc が必要とする C ツールチェーン（`cmake`、`clang`、
`libclang-dev`、`g++`、`git`）が要ります。これらのパッケージは `apt` でも
`dnf` でもスクリプトが導入します。BoringSSL をソースからビルドするため、
初回は数分かかります。

## 🗂️ インストーラが残したもの

| パス | 内容 |
| --- | --- |
| `/usr/local/bin/pingclair` | サーバーのバイナリ。 |
| `/usr/local/bin/pc` | 同じバイナリへのシンボリックリンク（短い名前）。 |
| `/etc/Pingclair/Pingclairfile` | サービスが実行する設定。 |
| `/etc/Pingclair/Pingclairfile.example` | コメント付きの例。アップグレードでも上書きされません。 |
| `/var/lib/pingclair/certs` | 証明書ストア。ユニットの `PINGCLAIR_TLS_STORE` が指します。 |
| `/var/lib/pingclair/html` | ポート 80 で配信される案内ページ。 |
| `/var/log/pingclair` | `log` シンクを設定したときに書き出される場所。 |
| `/etc/systemd/system/pingclair.service` | 有効化され、起動済みのユニット。 |

スクリプトが終わった時点でサービスはすでに応答しています。動いている設定は
案内用のもので、1 画面に収まります。

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

サービス用ユーザーと証明書ストアは存在しないときだけ作られ、既存の
`/etc/Pingclair/Pingclairfile` が置き換わることはありません。だからこそ
インストーラの再実行は初期化ではなくアップグレードになります
（[アップグレードと削除](/ja/start/upgrade/)）。

## ✅ インストールの確認

バイナリにバージョンを尋ねます。

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc` は同じバイナリなので、`pc version` も同じ文字列を出力します。次に
`systemd` に尋ねます。

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
    Process: 1805 ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile (code=exited, status=0/SUCCESS)
   Main PID: 1808 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` は `systemd` がプロセスの生存から推測したものではなく、
サーバー自身が送ったものです。ユニットは `notify` 型で、すべてのリスナーが
バインドされたあとに初めて準備完了を通知します。

最後にサーバー自身に尋ねます。

```bash
curl -i http://localhost/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 18747
Last-Modified: Tue, 22 Sep 2026 03:21:54 GMT
ETag: "493b-6ab1f452"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag` と `Last-Modified` を伴う `200` はファイルサーバーが応答した証拠で、
本文は `/var/lib/pingclair/html` の案内ページです。

## 🐳 Docker

公開イメージは設定ファイルモードで動きます。entrypoint は `pingclair`、既定の
コマンドは `run /etc/pingclair/Pingclairfile` です。イメージは
`/etc/pingclair` と `/var/lib/pingclair` をボリュームとして宣言し、80 と 443 を
公開します。

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv:ro
      - pingclair_tls:/var/lib/pingclair

volumes:
  pingclair_tls:
```

```bash
mkdir -p conf site
printf ':80 {\n    file_server /srv\n}\n' > conf/Pingclairfile
echo '<h1>hello from the container</h1>' > site/index.html
docker compose up -d
curl -i http://localhost/
```

間違えやすい点が三つあります。

- **`command:` を足さないこと。** イメージの既定はすでに
  `run /etc/pingclair/Pingclairfile` で、上書きするとそのコマンドが置き換わり
  ます。
- **`/var/lib/pingclair/certs` だけをマウントしないこと。** ストアは証明書
  ディレクトリの隣にも状態を置くので、`certs` だけをマウントしてコンテナを
  作り直すとそれが失われます。`/var/lib/pingclair` をマウントします。
- **公開タグを固定すること。** `latest` は最新リリースを追いかけます。本番は
  例のようにバージョンを指定します。公開タグは
  [パッケージページ](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)
  に並んでいます。

利用者が `docker` グループに入っていないホストではコマンドに `sudo` を付け、
または一度 `sudo usermod -aG docker "$USER"` でグループに加わり、新しい
ログインセッションを開きます。Ubuntu では `docker compose` プラグインは
`docker-compose-v2` パッケージに入っています。

## 🛠️ ソースからのビルド

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

必要環境: Rust 1.98.1（CI が固定している版）、`cmake`、`clang`、
`libclang-dev`、`g++`、`git`。ビルドの一部として BoringSSL をソースから
コンパイルするため、初回は数分かかります。

## ⚠️ インストールが失敗したとき

- **`This script must be run as root`。** スクリプトはホームディレクトリの
  外に書き込み、ユニットを導入します。`sudo` を付けて再実行します。
- **Fedora で `setcap: command not found`。** それは `libcap` パッケージです。
  インストーラは導入しますが、手作業で組んだホストには無いことがあり、その
  権限がないと 80 と 443 にバインドできません。
- **インストール直後に `Job for pingclair.service failed`。**
  `journalctl -u pingclair -n 20` を読みます。よくある原因は、検証を通らない
  設定か、すでにポート 80 を掴んでいる別のプロセスです。
- **サービスは動いているのに外から何も返らない。** リスナーはバインド済みで、
  パケットが届いていません。まずプロバイダのファイアウォールやセキュリティ
  グループ、次にホスト側の規則を確認します。
- **ホストに `systemd` がない。** バイナリは導入され使えますが、インストーラの
  サービス手順は実行できません。Docker か `pingclair run` を使います。

## 🧹 削除する

[アップグレードと削除](/ja/start/upgrade/) に手順と、残しておく価値のある
データが入ったディレクトリをまとめてあります。

## 🧭 次の手順

- [クイックスタート](/ja/start/quickstart/): 案内ページを自分の設定に置き換え、
  実際のサイトを配信します。
- [HTTPS](/ja/start/https/): 公開名に対する証明書。
- [サービスとして動かす](/ja/start/service/): ユニットの役割と安全な再読み込み。
