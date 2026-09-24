---
title: アーキテクチャ
h1_emoji: '🏗️'
description: サーバーを構成する crate、リクエストがそれらを通る経路、そして HTTP/1.1、HTTP/2、HTTP/3 で挙動が異なる箇所。
---

3 つの HTTP バージョンを話す Web サーバーには、失敗の仕方が 2 つあります。プロトコルごとに規則の複製が育っていくか、あるプロトコルだけが他のプロトコルの守る規則を黙って取りこぼすかです。Pingclair は、各トランスポートにはバイトを運ぶ仕事だけを任せ、すべてのリクエストを 1 つの共有ポリシー層に通すことで、その両方を避けています。このページでは、構成要素、リクエストの経路、そしてプロトコル間でまだ違いが残るわずかな箇所を説明します。対象は **v0.2.0-rc.3** です。

## 🧱 サーバーは少数の crate から作られた 1 つのバイナリ

Pingclair は Cargo workspace です。`pingclair` バイナリは次の crate をリンクしており、それぞれが 1 つの責務を持ちます。

| Crate | 役割 |
| --- | --- |
| `pingclair` | コマンドラインのエントリポイント。引数の解析、ログ、起動、停止、再読み込み。 |
| `pingclair-config` | 設定コンパイラ。Pingclairfile を読み、検査し、サーバーが実行する設定を生成します。 |
| `pingclair-proxy` | Pingora 上の HTTP/1.1 と HTTP/2、quiche 上の HTTP/3、ロードバランシング、そして共有のリクエストポリシー層。 |
| `pingclair-static` | 静的ファイル配信。ファイルの読み込み、MIME タイプ、レンジリクエストと条件付きリクエスト、ストリーミング。 |
| `pingclair-fastcgi` | `php_fastcgi` が PHP-FPM に到達するために使う FastCGI クライアント。 |
| `pingclair-tls` | 証明書管理。証明書ファイル、内部認証局、ACME による発行。 |
| `pingclair-api` | 状態の確認と設定の再読み込みのための Admin API。 |
| `pingclair-core` | 上記の crate が共有するデータ構造とライフサイクル。 |

## 🚦 すべてのリクエストが同じポリシー層を通る

```text
client
  |
  |  TLS with ALPN, or QUIC
  v
listener             HTTP/1.1 and HTTP/2 on TCP, HTTP/3 on UDP
  |
  v
transport adapter    Pingora ProxyHttp for TCP, tokio-quiche for QUIC
  |
  v
policy layer         routing, matchers, headers, rate limits, access log
  |
  v
handler              file server | reverse proxy | FastCGI | static response
  |
  v
upstream or disk
```

トランスポートアダプターはプロトコルのフレームをリクエストに変換して、次へ渡します。ルーティング、ヘッダー規則、レート制限、アクセスログはポリシー層に一度だけ実装されているため、HTTP/1.1、HTTP/2、HTTP/3 のどれでも同じように動作します。両方のトランスポートは同じコネクターでアップストリームに接続するので、コネクションプール、アップストリームへの TLS、タイムアウトも共通です。

## 🌊 すべてのリクエストに当てはまること

- **ボディはストリーミングされます。** リクエストとレスポンスのボディは、上限のあるチャンク単位でサーバーを通過します。圧縮もプロキシも完全なボディを先に集めることはしないため、大きなアップロードや読み取りの遅いクライアントがあっても、ボディの大きさに比例してメモリを消費することはありません。
- **アップストリームへの接続は再利用されます。** バックエンドへのキープアライブ接続はプールされます。ホスト名で指定したアップストリームは `dns_refresh` で設定した間隔で再解決されるため、バックエンドのコンテナが新しいアドレスで再起動しても、運用者が何もしなくても追従します。
- **リクエストの処理中、設定は読まれるだけで変更されません。** 各リクエストは、コンパイル済み設定の公開済みスナップショットを読みます。再読み込みは新しいスナップショットを作って差し替え、すでに処理中のリクエストは古いスナップショットのまま完了します。

## 🌐 プロトコルごとの違い

プロトコルによって異なる挙動がいくつかあります。本番環境で初めて気づくことがないよう、ここに挙げておきます。

| 領域 | v0.2.0-rc.3 での挙動 |
| --- | --- |
| トレーラー | リクエストのトレーラーはどのプロトコルでも転送しません。トレーラーを宣言したリクエストには、レスポンス開始前であれば `501` を返します。レスポンスがすでに始まっている HTTP/3 ストリームは、代わりにリセットします。トレーラーを予告するアップストリームのレスポンスには `502` を返します。 |
| `CONNECT` | Pingclair はトンネルを開きません。HTTP/1.1 と HTTP/2 は `405` を返します。HTTP/3 は標準的な `CONNECT` リクエストを不正な形式としてリセットし、`:scheme` と `:path` も持つものには `501` を返します。 |
| FastCGI | `php_fastcgi` は HTTP/3 を含むすべてのプロトコルで動作します。 |

📌 **次のリリース。** `main` では、`CONNECT` にはどのプロトコルでも `Allow` ヘッダー付きの `405` を返し、`TRACE` にも同じように応答します。これらの変更は v0.2.0-rc.3 には含まれず、[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) の Unreleased に記録されています。

## ⚠️ 負荷がかかると WebSocket のアップグレードが断続的に失敗する

Pingclair は WebSocket をプロキシしますが、マシンが忙しいときにはアップグレードの約 10〜15% が失敗します。外から見ると、失敗したアップグレードは `101 Switching Protocols` レスポンスの直後に閉じられた接続です。原因は Pingclair のアップグレード処理ではなく、上流の `pingora-proxy` crate の競合状態にあり、設定で回避する方法はありません。アイドル状態の開発マシンではまず再現しないため、ここに明記しています。上流の issue：[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)。

## 🧭 関連ページ

- [設定モデル](/ja/concepts/configuration/)：Pingclairfile が上で説明したスナップショットになるまで。
- [プロジェクト状況](/ja/project/status/)：このリリースが対応しているもの、拒否するもの。
