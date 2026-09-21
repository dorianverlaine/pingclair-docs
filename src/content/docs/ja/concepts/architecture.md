---
title: アーキテクチャ
description: サーバーの構成要素と、リクエストが通る経路。
---

## 🧱 構成要素

Pingclair は Cargo workspace です。実際に動くサーバーは `pingclair` バイナリで、次の crate をリンクします。

| Crate | 役割 |
| --- | --- |
| `pingclair` | コマンドライン入口。引数解析、ログ、起動、サービス用ラッパー。 |
| `pingclair-config` | 設定コンパイラ。Pingclairfile を字句解析、構文解析し、意味を検査します。 |
| `pingclair-proxy` | Pingora による HTTP/1.1 と HTTP/2 の代理、quiche による HTTP/3 リスナー、負荷分散、共通のリクエストポリシー層。 |
| `pingclair-static` | 静的ファイル配信。ファイル読み取り、MIME タイプ、レンジリクエスト、ストリーミング。 |
| `pingclair-tls` | 証明書管理。手動証明書、常駐する内部認証局、ACME による自動発行。 |
| `pingclair-api` | 状態の確認と設定の再読み込みを行う Admin API。 |
| `pingclair-core` | 上記の crate が共有するデータ構造とサーバーライフサイクル。 |

## 🚦 リクエストの経路

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

どちらのトランスポートも最終的に同じポリシー層へ合流します。そのためルーティング、ヘッダー処理、レート制限、アクセスログの挙動は HTTP/1.1、HTTP/2、HTTP/3 で一致します。違いが出るのはプロトコル上どうしても必要な箇所だけです。

## 🌊 リクエスト処理の特性

- **ボディはストリーミングされます。** リクエストとレスポンスのボディは、上限のあるチャンクとしてプロキシを通ります。圧縮、ミドルウェア、代理はボディ全体をバッファリングしないため、大きなアップロードや遅い読み手がボディサイズに比例したメモリを消費することはありません。
- **上流への接続は再利用されます。** バックエンドとの keepalive 接続は再利用されます。ホスト名の上流は `dns_refresh` で設定した間隔で再解決されるため、新しいアドレスで再起動したコンテナにも操作なしで追従します。
- **実行時の状態はリクエスト中に不変です。** リクエストは公開済みのスナップショットを読みます。再読み込みは使用中のものを書き換えるのではなく、新しいスナップショットを公開します。

## 🌐 プロトコルごとの差異

一部の挙動はプロトコルによって意図的に異なります。あとから発見するのではなく、ここに書いておきます。

| 領域 | 挙動 |
| --- | --- |
| Trailers | リクエストで宣言された trailer は転送されません。レスポンス確定前は `501` を返し、確定済みの HTTP/3 ストリームは reset し、上流がレスポンス trailer を通知した場合は `502` を返します。 |
| CONNECT | HTTP/3 では、トンネル対応が実装されるまで `CONNECT` と extended `CONNECT` は `501` を返します。 |
| FastCGI | `php_fastcgi` は HTTP/1.1 と HTTP/2 で動作します。FastCGI を必要とするルートは、その経路が専用の FastCGI クライアントを持つまで HTTP/3 で `501` を返します。 |

## ⚠️ 既知の不具合

WebSocket のアップグレードは負荷がかかると断続的に失敗します。混雑したマシンでは約 10-15% が失敗します。原因は Pingclair 自身のアップグレード処理ではなく、上流の `pingora-proxy` crate の競合状態です。アイドル状態の開発機では再現しないため、ここに明記しています。上流の issue: [cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)。
