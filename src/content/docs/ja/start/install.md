---
title: インストール
description: リリースバイナリ、Docker、またはソースから Pingclair をインストールします。
---

Pingclair は Linux を対象としています。リリースバイナリは `x86_64` と `aarch64` の 2 種類を公開しています。macOS はソースからのビルドに対応していますが、開発用途が主で、配信対象のプラットフォームではありません。

## 📌 リリース状況

既定のインストール対象は **v0.2.0-rc.3** で、リリース候補です。インストールスクリプトは実際に導入したタグを表示し、展開前に公開されている SHA-256 チェックサムを検証します。

`v0.1.x` 系はメンテナンスされていません。修正もバックポートもセキュリティ勧告もありません。移行すべき理由の 1 つは、`v0.1.x` が Admin API の `api_key` フィールドを解析しながら一度も読んでおらず、そのフィールドが何も保護していなかったことです。

## 📦 リリースバイナリからのインストール

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

スクリプトは現在のアーキテクチャ向けのリリースバイナリを取得し、チェックサムを検証し、`pingclair` と `pc` エイリアスを導入し、非特権ユーザー `pingclair` を作成し、低いポートを bind するために必要な capability を付与し、`systemd` ユニットをインストールします。

`main` ブランチをビルドして導入する場合:

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main` はローカルでコンパイルします。Rust 1.98 以降と、BoringSSL および jemalloc が必要とする C ツールチェーン（`cmake`、`clang`、`libclang-dev`、`g++`、`git`）が必要です。

インストールの確認:

```bash
pingclair version
pc version
```

## 🐳 Docker

イメージはすでに config-file モードで動作します。entrypoint は `pingclair`、既定のコマンドは `run /etc/pingclair/Pingclairfile` です。そのため Compose サービスは設定ファイルとデータストアをマウントするだけで済みます。

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv
      - pingclair_tls:/var/lib/pingclair/certs

volumes:
  pingclair_tls:
```

`Pingclairfile` を `./conf/` に、静的ファイルを `./site/` に置き、設定からは `root /srv` のようなコンテナ内の絶対パスで参照します。HTTPS、80 番ポートへのリダイレクト、HTTP/3 の挙動はホスト上での配備と同一です。

間違えやすい点が 2 つあります。

- **🔒 TLS ストアはキャッシュではなく状態です。** 発行済み証明書、ACME アカウント鍵、内部認証局が入っています。削除すると証明書の再発行が必要になり、信頼しているクライアントは新しい内部ルート証明書を信頼し直す必要があります。
- **⚠️ `command:` を追加しないでください。** イメージの既定コマンドがすでに `run /etc/pingclair/Pingclairfile` であり、上書きするとこのコマンドが置き換わります。

本番では `latest` ではなくリリースタグを固定してください。公開されているタグは[パッケージページ](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)にあります。

## 🛠️ ソースからのビルド

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

必要なものは Rust 1.98.1（CI が固定しているバージョン）、`cmake`、`clang`、`libclang-dev`、`g++`、`git` です。BoringSSL をソースからビルドするため、初回のビルドには数分かかります。

## 🧭 次のステップ

- [クイックスタート](/ja/start/quickstart/): 最初の設定を書いて検証し、実際に動かします。
- [設定モデル](/ja/concepts/configuration/): 検証が何を実行可能と判断するか。
