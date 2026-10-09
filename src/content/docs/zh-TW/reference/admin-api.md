---
title: Admin API
h1_emoji: '🩺'
description: Admin API 的端點、驗證、設定讀寫、重載限制與指標名稱。
---

Admin API 在伺服器行程內提供設定讀取與替換、就緒檢查及指標擷取。`pingclair reload` 與 `pingclair stop` 使用它。

📌 本頁描述 **v0.2.2**。

## 🔌 啟用管理端點

只有寫出全域 `admin` 或在沒有設定檔時執行 `pingclair run`，才有此 API。預設位址為 `127.0.0.1:2019`。

```caddyfile
{
    admin 127.0.0.1:2019
}

http://:8080 {
    respond "ok"
}
```

管理連接埠被佔用時會以 `failed to bind admin API on ADDR` 停止啟動。`admin off` 不綁定管理端點。

## 🔐 存取驗證

- `admin <address> <token>` 要求每個請求帶 `Authorization: Bearer <token>`；缺少或錯誤時回應 `401` 與 `WWW-Authenticate: Bearer`。
- 沒有 token 時記錄警告，只允許 loopback 用戶端；其他用戶端得到 `403`。
- `admin { … }` 的 `origins` 與 `enforce_origin` 限制瀏覽器來源。沒有 Origin 的請求可通過，除非啟用 `enforce_origin`。

`/live` 與 `/ready` 也受相同檢查保護。

## 🧭 端點

| 方法與路徑 | 作用 |
| --- | --- |
| `GET /live` | 行程存活時回應 `200`，包含排空期間。 |
| `GET /ready` | 所有監聽器綁定後回應 `200`；之前及開始停止後回應 `503`。 |
| `GET /metrics` | Prometheus 文字格式；未收集時為空本文。 |
| `GET /config/[path]` | 讀取整份執行中設定或其中一個值。 |
| `POST`、`PUT`、`PATCH`、`DELETE /config/[path]` | 修改其中的值並套用結果。 |
| `GET` … `DELETE /id/<id>` | 透過文件的 `@id` 欄位定位相同操作。 |
| `POST /load` | 替換整份設定。 |
| `POST /adapt` | 將 Pingclairfile 轉為 JSON，不套用。 |
| `POST /stop` | 優雅停止行程。 |
| `GET /reverse_proxy/upstreams` | 列出設定中的上游，包括 `handle` 內的上游。 |
| `GET /cache` | 回應快取使用量與容量。 |
| `POST /cache/purge` | 清除一個快取 URL，本文為 `{"host": "…", "path": "…"}`。 |

設定文件是 `pingclair adapt` 輸出的 Pingclair 結構。Caddy 的 `{"apps": …}` 文件會被指名拒絕，而這個拒絕是刻意的邊界、不是缺漏的轉接器：兩份文件沒有任何共同的頂層鍵或處理器名稱，接受 Caddy 的 JSON 等於要再維護一套跟著 Caddy 模組樹跑的設定介面。`POST /load` 除了自己的 JSON 之外，還接受 **Caddyfile**（`Content-Type: text/caddyfile`），也就是維運人員實際放在 git 裡的格式。

## 📄 設定讀寫

- 不存在的設定路徑、物件鍵或陣列索引回應 `200` 與 JSON `null`，並附 ETag。寫入不存在的路徑仍可能失敗，診斷會指出最近的父層。
- 設定讀取附帶路徑限定的 `Etag`。設定寫入可帶相同路徑的 `If-Match`，過期時回應 `412` 並保留原設定；沒有 `If-Match` 是無條件寫入。此規則不擴充至 `/load` 或 `/adapt`。
- 讀取以 `[redacted]` 遮蔽管理 token、DNS 憑證、Basic Auth 雜湊，以及機密標頭或 FastCGI env 值。機密標頭包括 `Authorization`、`Proxy-Authorization`、`Cookie`、`Set-Cookie`，及名稱含 `api-key`、`token`、`secret` 或 `password` 的欄位。
- 儲存的真實值不變，透過路徑寫入可原地修改。`/load` 與 `POST /config` 拒絕把 `[redacted]` 當成機密重新載入；請先還原真實值。
- 重載期間仍可讀取，每個請求使用授權它的同一份已發布世代。寫入與其他重載競爭時可能得到 `409`，條件寫入也可能得到 `412`；重新讀取並驗證授權後再試。

## 🔁 載入可修改的範圍

載入以不可分割的方式替換設定。請求只看見舊或新的完整狀態；編譯失敗時舊設定繼續提供服務。需要新 socket 或改變啟動政策的設定會得到 `409` 與 `restart_required`，不會部分套用：

- 新增、移除或移動監聽位址。
- 新增 TLS 主機名稱或改變憑證拓撲。
- 修改啟動時固定的全域政策，包括 `metrics` 與 `trusted_proxies`。
- 在允許 session resumption 的監聽器啟用雙向 TLS。

從空設定啟動的行程是例外：Unix 上第一次 `/load` 可加入明文 HTTP 監聽器。TLS 與 HTTP/3 需從檔案啟動。全域行程日誌等可重載選項不受上述啟動政策限制。

## 📊 指標

只有設定全域 `metrics` 才收集。否則 `/metrics` 與網站的 `metrics` 路由回應 `200` 及空本文。`metrics { per_host }` 為設定的主機名稱加入 `host` 標籤，其餘 Host 歸入 `other`。

0.2.0 將以下標準系列重新命名：

| 0.2.0 之前 | 0.2.0 起 |
| --- | --- |
| `pingclair_requests_total` | `caddy_http_requests_total` |
| `pingclair_request_duration_seconds` | `caddy_http_request_duration_seconds` |
| `pingclair_request_size_bytes` | `caddy_http_request_size_bytes` |
| `pingclair_response_size_bytes` | `caddy_http_response_size_bytes` |
| `pingclair_response_duration_seconds` | `caddy_http_response_duration_seconds` |
| `pingclair_request_errors_total` | `caddy_http_request_errors_total` |
| `pingclair_admin_http_requests_total` | `caddy_admin_http_requests_total` |
| `pingclair_reverse_proxy_upstreams_healthy` | `caddy_reverse_proxy_upstreams_healthy` |

Histogram 的 `_bucket`、`_sum` 與 `_count` 跟隨系列改名，舊名稱不再匯出。沒有對應名稱的連線、過載、快取、日誌丟棄、上游時間／錯誤／重試、TLS、H3、就緒、設定版本、佇列、circuit 與行程資源指標保留 `pingclair_`。名稱相同不代表完整標籤結構與 Caddy 相同。

## 🧭 相關頁面

- [命令列](/zh-TW/reference/command-line/)：使用 API 的 `reload` 與 `stop`。
- [設定模型](/zh-TW/concepts/configuration/)：重載可套用與拒絕的變更。
- [全域選項](/zh-TW/reference/directives/#global-options)：`admin` 與 `metrics`。
- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)：行為依據與升級說明。
