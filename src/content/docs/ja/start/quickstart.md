---
title: クイックスタート
description: 最初の Pingclairfile を書き、検証して、配信を始めます。
---

このページでは、インストール直後の状態から動くサーバーまで進めます。まず 8080 番ポートで静的サイトを配信し、次にリバースプロキシを置きます。

## 1. ✍️ 設定を書く

`Pingclairfile` という名前のファイルを作成します。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

ファイルには site block が 1 つだけあります。`localhost:8080` はこのサイトが応答するアドレス、`file_server` はファイル配信、`./public` は配信元ディレクトリで、実行時の作業ディレクトリからの相対パスです。

## 2. ✅ 検証する

```bash
pingclair validate
```

`validate` は既定で `./Pingclairfile` を読み込み、`./Caddyfile` も検出します。設定をコンパイルし、証明書パスのような意味的条件を検査して、問題があれば非ゼロで終了します。検証は助言ではありません。検証に失敗した設定は実行されません。

設定を書いている間は、次の 2 つのコマンドも役立ちます。

```bash
pingclair adapt --pretty   # コンパイル後の JSON を表示
pingclair fmt --diff       # 整形差分を表示（ファイルは書き換えない）
```

## 3. 🚀 実行する

```bash
pingclair run Pingclairfile
```

プロセスは開いた listener をログに記録し、終了シグナルを受け取るまでリクエストを処理し続けます。

## 4. 🔍 確認する

別のターミナルで:

```bash
curl -i http://localhost:8080/
```

配信されたファイルの `ETag` と `Last-Modified` ヘッダーを伴う `200` が返るはずです。

リクエストが固まる場合は、システムプロキシがループバック通信を横取りしていないか確認し、`curl --noproxy '*'` で再試行してください。

## 5. 🔁 アプリケーションをプロキシする

site block を、3000 番ポートのバックエンドへ転送するリバースプロキシに置き換えます。

```caddyfile
localhost:8080 {
    reverse_proxy localhost:3000
}
```

同じコマンドで検証と実行をやり直します。応答はバックエンドから返るようになります。複数の上流、負荷分散ポリシー、ヘルスチェック、障害時の挙動は [`reverse_proxy`](/ja/reference/directives/#reverse_proxy) を参照してください。

## 6. 🔒 TLS を終端する

公開ドメイン名では証明書を自動取得します。

```caddyfile
{
    email admin@example.com
}

example.com {
    reverse_proxy localhost:3000
}
```

自動 HTTPS には、サイトアドレスが公開名であることと、ACME チャレンジがサーバーに到達できること（通常は 80 番ポート）が必要です。プライベートなオリジンには `tls internal` を使い、ローカルの認証局から発行します。クライアントは `$PINGCLAIR_TLS_STORE/internal/root.crt` にあるルート証明書を信頼する必要があります。

## 7. ⚙️ サービスとして動かす

インストーラーは `systemd` ユニットを作成し、`pc` コマンドで管理できます。

```bash
pc service start
pc service status
pc service reload   # 再起動せずに設定を読み直す
```

## 🧭 次のステップ

- [設定モデル](/ja/concepts/configuration/)
- [アーキテクチャ](/ja/concepts/architecture/)
- [ディレクティブ一覧](/ja/reference/directives/)
