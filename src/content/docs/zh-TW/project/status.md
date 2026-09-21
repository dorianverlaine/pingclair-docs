---
title: 專案狀態
description: 目前版本支援什麼、拒絕什麼，以及已知的缺陷。
---

## 📌 發行版本

目前版本是 **v0.2.0-rc.3**，屬於 release candidate。它的[發行說明](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)列出變更內容，以及標記版本時已知的缺陷。

`v0.1.x` 系列已不再維護：沒有修正、沒有回溯移植、也沒有安全公告。此外，`v0.1.x` 會解析 Admin API 的 `api_key` 欄位卻從未讀取，等於該欄位沒有任何保護作用。

## ✅ 支援項目

| 領域 | 狀態 |
| --- | --- |
| 協定 | 在 TCP 上提供 HTTP/1.1 與 HTTP/2，在 QUIC 上提供 HTTP/3，來自同一份設定。 |
| TLS | 透過 ACME 自動取得公開憑證、常駐的內部憑證授權單位，以及手動的憑證與金鑰檔案。 |
| 靜態檔案 | 檔案供應，支援 `zstd` 與 `gzip` 壓縮、range 請求與條件式請求。 |
| 反向代理 | 多個上游、多種負載平衡策略、主動健康檢查與備援上游。 |
| FastCGI | 在 HTTP/1.1 與 HTTP/2 上支援 `php_fastcgi`。 |
| 速率限制 | 依 matcher 的精確本機速率限制。 |
| 可觀測性 | 支援輪替的存取日誌，以及 Prometheus metrics。 |
| 管理 | 用於檢視狀態與重新載入設定的 Admin API。 |

## 🛡️ 刻意拒絕的設定

設定格式定義的名稱多於伺服器實作的數量。伺服器無法兌現的名稱，會在載入時以名稱拒絕，並附上「功能不存在」的訊息。讀者最常問到的例子：

- `map`、`invoke` 與 `tracing` 等 directive；
- `storage` 選項，因為憑證與狀態只存放在本機磁碟；
- `on_demand_tls` 與 OCSP stapling 相關選項；
- `handle_errors`，其設定型別存在但不會執行任何工作；
- `encode br`，因為沒有串流 Brotli 編碼器。

完整清單維護在伺服器倉庫的 README，並由一個測試把關：當剖析器拒絕了清單未提及的名稱時，測試會失敗。

## ⚠️ 已知限制

- **憑證儲存只在本機。** 多個實例無法共用同一份憑證儲存區，因為該儲存區是磁碟上的目錄。
- **DNS-01 只有一個供應商。** `tls { dns cloudflare <token> }` 與全域的 `acme_dns` 只實作了 Cloudflare。其他供應商名稱會在啟動時被拒絕，而不是被接受後忽略。
- **HTTP/3 的 trailer 與 tunnel。** 請求中宣告的 trailer 不會被轉送（回應送出前回 `501`，送出後對串流發出 reset），上游 trailer 會產生 `502`，而 `CONNECT` 會回 `501`。
- **HTTP/3 上的 FastCGI 會回 `501`**，直到該路徑擁有自己的 FastCGI client。
- **WebSocket 升級在負載下會間歇性失敗**，在忙碌的機器上約 10-15%。原因是上游 `pingora-proxy` crate 的競態（[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)），不是 Pingclair 自己的處理；閒置的機器無法重現。

## 🐛 回報

缺陷與文件錯誤請透過[issue tracker](https://github.com/dorianverlaine/pingclair/issues)回報。指名私人通報管道的安全政策目前尚未公布。

## 📚 相關文件

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)：版本之間變更了什麼。
- [效能量測](/zh-TW/project/benchmarks/)：量測條件與結果。
- [架構](/zh-TW/concepts/architecture/)：組成元件與請求路徑。
