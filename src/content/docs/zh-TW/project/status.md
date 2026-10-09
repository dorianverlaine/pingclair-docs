---
title: 專案狀態
h1_emoji: '📌'
description: 目前的發行版支援什麼、刻意拒絕什麼、有哪些已知的限制與缺陷，以及升級時需要檢查的變更。
---

本頁列出 **v0.2.2** 的支援功能、設定限制與已知缺陷，方便部署前確認。

## 📌 0.2.2 發行版

目前的發行版是 **v0.2.2**，0.2 系列最新的修補版本。[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)記錄每個發行版的變更，以及標記版本時已知的缺陷。0.2.1 與 0.2.2 不需要調整設定：`handle_path` 與沒有參數的 `handle` 並列時，由符合請求的路由回答；listener 可以允許名稱含底線的請求欄位；重新載入後新增的存取日誌 channel 會收到記錄。0.3 開發線位於 `main`，不屬於這個發行版。

`v0.1.x` 系列已停止維護：沒有修正、沒有回溯移植，也不會發布安全公告。請升級離開它：`v0.1.x` 會解析 Admin API 的 `api_key` 欄位，卻從來不讀取，所以它的 Admin API 實際上沒有驗證任何人。

## ✅ 這個發行版支援的功能

| 領域 | 支援內容 |
| --- | --- |
| 協定 | 以同一份設定，在 TCP 上提供 HTTP/1.1 與 HTTP/2，並透過 QUIC 提供 HTTP/3。 |
| TLS | 透過 ACME 自動取得公開憑證、持久化的內部憑證授權單位，以及由你提供的憑證檔案。 |
| 靜態檔案 | 檔案服務，支援 `zstd` 與 `gzip` 壓縮、range 請求與條件式請求。 |
| 反向代理 | 多個上游、多種負載平衡策略、主動健康檢查，以及備援上游。 |
| FastCGI | 在 HTTP/1.1、HTTP/2 與 HTTP/3 上支援 `php_fastcgi`。 |
| 速率限制 | 依匹配器進行的精確本機速率限制。 |
| 可觀測性 | 支援輪替的存取日誌，以及 Prometheus 指標。 |
| 管理 | 用來檢視狀態與重新載入設定的 Admin API。 |

## 🛡️ 伺服器刻意拒絕的名稱

Caddyfile 格式定義的名稱比 Pingclair 實作的多。尚未支援的名稱，
會在載入檔案時被拒絕，錯誤訊息會指出缺少的是哪一項功能；
含有這類名稱的設定無法啟動。

以下完整清單來自 0.2.2 中的登錄表，列出 Pingclair 能辨識為 Caddy 語法、
但尚未在該上下文中實作的名稱。

**指令：**

`copy_response`、`copy_response_headers`、`fs`、`invoke`、`log_append`、
`log_name`、`map`、`push`、`skip_log`、`tracing`。

`copy_response` 與 `copy_response_headers` 可以作為 `handle_response` 的子指令使用；
只有把它們寫成獨立指令時才會被拒絕。

**全域選項：**

`acme_ca`、`acme_ca_root`、`acme_eab`、`cert_issuer`、`cert_lifetime`、`ech`、
`events`、`fallback_sni`、`filesystem`、`frankenphp`、`key_type`、
`ocsp_interval`、`on_demand_tls`、`preferred_chains`、`renew_interval`、
`shutdown_delay`、`storage_clean_interval`。

**`tls { … }` 裡的選項：**

`protocols`、`ciphers`、`curves`、`alpn`、`load`、`ca`、`ca_root`、`key_type`、
`eab`、`issuer`、`get_certificate`、`on_demand`、`reuse_private_keys`、
`insecure_secrets_log`、`force_automate`。

### 🧭 重要的相容性差異

- 一個名稱受到支援，不代表它能用在 Caddy 的每一種上下文。例如，`copy_response`
  必須寫在 `handle_response` 裡。
- DNS-01 支援 Cloudflare。其他 provider 名稱會被拒絕，不會退回另一種驗證方式。
- `encode br` 會被拒絕，因為代理回應沒有串流式 Brotli 實作。請使用 `zstd` 或 `gzip`。
- `storage file_system <path>`、`ocsp_stapling off` 與 `handle_errors` 已在 0.2.0
  上實作；仍把它們列為不支援的舊文件已經過時。
- 請求欄位名稱若含底線會被丟棄（Caddy 也是如此），除非 `servers { expected_underscore_headers … }` 列出該名稱，或以 `*` 結尾的前綴。這個選項在 0.2.2 才實作；在此之前，這類欄位在三個傳輸層都會被丟棄，且無法保留下來。

## ⚠️ 已知限制

憑證儲存區僅支援本機目錄，不支援共用儲存後端、外掛或 Caddy 原生 JSON 結構；第四層代理屬於 0.3 開發線。DNS-01 支援 Cloudflare，其他 provider 名稱會被拒絕，不會退回另一種驗證方式。`CONNECT` 與 `TRACE` 會得到附帶 `Allow` 的 `405`；格式錯誤的 CONNECT 目標得到 `400`。宣告的 request trailers 不會轉送；宣告 `Trailer` 的上游回應會保留其狀態與本文，trailer 欄位則被丟棄。

## 🐛 0.2.2 的已知缺陷

[CHANGELOG 的已知缺陷章節](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#-known-defect--websocket-upgrades-under-load)記錄了以下限制，每一項都有對應的未關閉 issue。設定驗證不會偵測這些執行期缺陷。

- **負載下的 WebSocket 升級：** 忙碌機器上約 10–15% 失敗，`101` 之後立即 EOF，沒有可避免此競態的設定；問題出在 `pingora-proxy`（cloudflare/pingora#946）。
- **帶有 Content-Length 的 HTTP/1.1 回應：** 來源宣告長度的代理本文，會等到本文結束才送出。帶有即時性訊號的回應——`text/event-stream`，或設定 `flush_interval -1` 的路由——已經會串流；HTTP/2 與 HTTP/3 不受影響（#296）。
- **未宣告的 request trailers：** 在 HTTP/1 上，沒有 `Trailer` 宣告就送出的 trailer 區段會被丟棄，`aws-chunked` 上傳的 checksum 因此不會到達來源，而請求仍正常取得回應（#257）。
- **升級連線的半關閉：** 用戶端半關閉會結束 tunnel，遺失後端尚未送完的位元組（#274）。
- **HTTP/3 上的回應快取：** 有 `cache` 區塊的路由，在 HTTP/1.1 與 HTTP/2 由儲存區回答，在 HTTP/3 則回到來源（#297）。
- **`103 Early Hints`：** 上游的中間回應只會到達 HTTP/1.1 用戶端；HTTP/2 與 HTTP/3 會丟棄（#207）。
- **HTTP/3 傳輸參數：** 77 項 h3spec 檢查中有 18 項失敗；修正屬於 QUIC 函式庫（#282）。

## 🔁 升級至 0.2.2

[升級指南](/zh-TW/start/upgrade/)整理最可能影響 0.1.x 與候選版本設定的變動。[Before you upgrade 清單](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)是完整的發行檢查表。

## 🐛 回報缺陷

請在 [Pingclair 問題追蹤器](https://github.com/dorianverlaine/pingclair/issues)回報缺陷與文件錯誤。

## 📚 相關頁面

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)：發行變動與已知缺陷。
- [效能測量](/zh-TW/project/benchmarks/)：歷史測量條件。
- [架構](/zh-TW/concepts/architecture/)：元件與請求處理。
