---
title: 專案狀態
h1_emoji: '📌'
description: 目前的發行版支援什麼、刻意拒絕什麼、有哪些已知的限制與缺陷，以及下一版會有哪些變動。
---

部署之前，本頁只回答一個問題：目前的發行版能不能做到你要的事，它的界線又在哪裡。本頁描述的是 **v0.2.0-rc.3**，也就是最新公開的發行版。

## 📌 目前的發行版是 release candidate

目前的發行版是 **v0.2.0-rc.3**。它的[發行說明](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)列出了變更內容，以及標記版本時已知的缺陷。

`v0.1.x` 系列已停止維護：沒有修正、沒有回溯移植，也不會發布安全公告。請升級離開它：`v0.1.x` 會解析 Admin API 的 `api_key` 欄位，卻從來不讀取，所以它的 Admin API 實際上沒有驗證任何人。

## ✅ 這個發行版支援的功能

| 領域 | 支援內容 |
| --- | --- |
| 協定 | 以同一份設定，在 TCP 上提供 HTTP/1.1 與 HTTP/2，並透過 QUIC 提供 HTTP/3。 |
| TLS | 透過 ACME 自動取得公開憑證、持久化的內部憑證授權單位，以及由你提供的憑證檔案。 |
| 靜態檔案 | 檔案服務，支援 `zstd` 與 `gzip` 壓縮、range 請求與條件式請求。 |
| 反向代理 | 多個上游、多種負載平衡策略、主動健康檢查，以及備援上游。 |
| FastCGI | 在 HTTP/1.1 與 HTTP/2 上支援 `php_fastcgi`。 |
| 速率限制 | 依匹配器進行的精確本機速率限制。 |
| 可觀測性 | 支援輪替的存取日誌，以及 Prometheus 指標。 |
| 管理 | 用來檢視狀態與重新載入設定的 Admin API。 |

## 🛡️ 伺服器刻意拒絕的名稱

Caddyfile 格式定義的名稱比 Pingclair 實作的多。伺服器無法兌現的名稱，會在載入檔案時被拒絕，錯誤訊息會指出缺少的是哪一項功能；含有這類名稱的設定無法啟動。讀者最常問到的幾個：

- `map`、`invoke` 與 `tracing` 指令；
- `storage` 選項，因為憑證與狀態只存放在本機磁碟；
- `on_demand_tls` 與 `ocsp_stapling` 選項；
- `handle_errors`；自訂錯誤頁面請改用 `error_page`；
- `encode br`，因為沒有串流式的 Brotli 編碼器。

完整清單在伺服器儲存庫的 README。那裡有一項測試：只要 parser 拒絕了一個 README 沒提到的名稱，測試就會失敗，所以這份清單不會落後於程式碼。

## ⚠️ 已知限制

- **憑證儲存只在本機。**多個執行個體無法共用同一個憑證儲存區，因為它就是磁碟上的一個目錄。
- **DNS-01 在這個發行版裡無法完成。**`tls { dns cloudflare <token> }` 與全域的 `acme_dns` 選項接受 Cloudflare，其他 provider 則會被指名拒絕。但在 v0.2.0-rc.3 中，每一張 DNS-01 訂單最後都是 `Invalid`，因為 TXT 記錄放的值是錯的。修正已在 `main` 上（[HTTPS](/zh-TW/start/https/#-dns-01-與萬用字元憑證)）。
- **HTTP/3 沒有 trailers，也沒有 tunnel。**宣告了 request trailers 的請求在每種協定上都會被拒絕，HTTP/3 則會重設 `CONNECT`（[架構](/zh-TW/concepts/architecture/#-各協定的差異)）。
- **HTTP/3 上的 FastCGI 會回應 `501`。**
- **負載下 WebSocket 升級會間歇性失敗**，在忙碌的機器上大約 10–15%。原因是上游 `pingora-proxy` crate 中的一個競態條件（[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)），閒置的機器上很少重現。

## 🔁 下一版有哪些變動

以下變動已在 `main` 上，但不在 v0.2.0-rc.3 裡。其中有幾項會在升級時改變行為；[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) 在 Unreleased 底下逐一列出，並附有升級說明。

- **路由順序跟隨 Caddy。**決定由哪一條路由回應的是指令順序，而不是最具體的路徑（[設定模型](/zh-TW/concepts/configuration/#-哪一條路由回應請求)）。
- **只有 `encode` 要求的地方才壓縮。**沒有 `encode` 的網站會以未壓縮的形式提供檔案。
- **不再有預設的請求本文上限。**原本 1 MiB 的預設值移除了；如果你依賴它，請設定 `request_body { max_size … }`。
- **`remote_ip` 與 `client_ip` 有所區別。**`remote_ip` 匹配連線的對端，`client_ip` 匹配經過 `trusted_proxies` 之後的用戶端。要在 Pingclairfile 裡封鎖用戶端，請匹配 `client_ip` 並使用 `abort`；`blocked_ips` 只存在於 JSON 設定。
- **`CONNECT` 與 `TRACE` 會得到 `405`**，並在每種協定上附帶 `Allow` 標頭。
- **HSTS 跟著連線走。**`Strict-Transport-Security` 只會出現在加密的回應上；在 Pingclairfile 中以 `header Strict-Transport-Security "max-age=…"` 開啟。
- **停止是優雅的。**`SIGTERM` 會讓進行中的請求在 `grace_period`（預設 30 秒）內完成。
- **管理或 HTTP/3 連接埠被佔用時會中止啟動**，而不是只記一筆日誌。
- **閘道錯誤會標明是誰產生的。**由 Pingclair 自己產生的 `502` 或 `504` 會帶有 `Proxy-Status` 標頭。
- **DNS-01 可以運作**，萬用字元網站只會申請一張萬用字元憑證。
- **接受 `storage file_system <path>` 與 `ocsp_stapling off`。**
- **內部憑證授權單位搬到 Caddy 的目錄配置。**舊的不會被遷移：會建立新的根憑證，用戶端必須重新信任它。

## 🐛 回報缺陷

缺陷與文件錯誤請回報到 [issue tracker](https://github.com/dorianverlaine/pingclair/issues)。附私密回報管道的安全政策尚未發布。

## 📚 相關頁面

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)：各發行版之間的變更。
- [效能基準測試](/zh-TW/project/benchmarks/)：量測條件與結果。
- [架構](/zh-TW/concepts/architecture/)：組成元件與請求路徑。
