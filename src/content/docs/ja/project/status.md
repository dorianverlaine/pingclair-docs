---
title: プロジェクト状況
description: 現在のリリースが対応するもの、拒否するもの、既知の不具合。
---

## 📌 リリース

現在のリリースは **v0.2.0-rc.3** で、リリース候補です。変更内容とタグ付け時点で判明している不具合は[リリースノート](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)にあります。

`v0.1.x` 系はメンテナンスされていません。修正もバックポートもセキュリティ勧告もありません。加えて `v0.1.x` は Admin API の `api_key` フィールドを解析しながら読んでおらず、そのフィールドは何も保護していませんでした。

## ✅ 対応しているもの

| 領域 | 状況 |
| --- | --- |
| プロトコル | TCP 上の HTTP/1.1 と HTTP/2、QUIC 上の HTTP/3 を 1 つの設定から。 |
| TLS | ACME による公開証明書の自動取得、常駐する内部認証局、手動の証明書と鍵。 |
| 静的ファイル | `zstd` と `gzip` の圧縮、レンジリクエスト、条件付きリクエストに対応した配信。 |
| リバースプロキシ | 複数の上流、複数の負荷分散ポリシー、アクティブヘルスチェック、予備の上流。 |
| FastCGI | HTTP/1.1 と HTTP/2 で `php_fastcgi` に対応。 |
| レート制限 | マッチャー単位の正確なローカルレート制限。 |
| 可観測性 | ローテーション対応のアクセスログと Prometheus メトリクス。 |
| 管理 | 状態の確認と設定の再読み込みを行う Admin API。 |

## 🛡️ 意図的に拒否する設定

設定形式が定義する名前は、サーバーが実装している数より多くなっています。満たせない名前は読み込み時に名前を挙げて拒否され、「機能が存在しない」と伝えます。よく質問される例:

- `map`、`invoke`、`tracing` などのディレクティブ
- `storage` オプション（証明書と状態はローカルディスクのみに保存するため）
- `on_demand_tls` と OCSP stapling 関連のオプション
- `handle_errors`（設定型は存在しますが何も行いません）
- `encode br`（ストリーミングの Brotli エンコーダーがないため）

完全な一覧はサーバーリポジトリの README にあり、パーサーが一覧にない名前を拒否すると失敗するテストで守られています。

## ⚠️ 既知の制限

- **証明書ストアはローカルのみ。** ストアはディスク上のディレクトリであるため、複数のインスタンスで 1 つのストアを共有できません。
- **DNS-01 のプロバイダーは 1 つ。** `tls { dns cloudflare <token> }` と global の `acme_dns` は Cloudflare のみ実装しています。他のプロバイダー名は起動時に拒否され、受理して無視されることはありません。
- **HTTP/3 の trailer とトンネル。** リクエストで宣言された trailer は転送されません（確定前は `501`、確定後はストリームを reset）。上流の trailer は `502` になり、`CONNECT` は `501` を返します。
- **HTTP/3 の FastCGI は `501` を返します。** その経路が専用の FastCGI クライアントを持つまでの挙動です。
- **WebSocket のアップグレードは負荷時に断続的に失敗します。** 混雑したマシンで約 10-15% です。原因は Pingclair の処理ではなく上流 `pingora-proxy` crate の競合状態です（[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)）。アイドル状態のマシンでは再現しません。

## 🐛 報告

不具合とドキュメントの誤りは [issue tracker](https://github.com/dorianverlaine/pingclair/issues) へ報告してください。非公開の報告窓口を定めたセキュリティポリシーはまだ公開していません。

## 📚 関連ドキュメント

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md): リリース間の変更。
- [性能測定](/ja/project/benchmarks/): 測定条件と結果。
- [アーキテクチャ](/ja/concepts/architecture/): 構成要素とリクエストの経路。
