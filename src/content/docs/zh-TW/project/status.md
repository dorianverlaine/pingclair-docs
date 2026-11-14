---
title: 專案狀態
h1_emoji: '📌'
description: v0.3.0-alpha.1 預覽版支援的內容、刻意拒絕的設定、已知限制，以及升級前的準備。
---

本頁說明 **v0.3.0-alpha.1** 的行為與已知限制。這是 0.3 系列的第一個預覽版，適用於
開發或預備環境；正式環境請先使用最新穩定版。

## 📌 0.3.0-alpha.1 預覽版

`v0.3.0-alpha.1` 是預覽版。最新穩定版仍是 **v0.2.3**；`latest` 安裝與容器標籤
繼續跟隨穩定版。[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
記錄完整變更與升級說明。

此預覽版新增：

- 全域 `layer4` 區塊下的原始 TCP 路由，支援 TLS ClientHello 的 SNI 與 ALPN
  比對、來源 IP 比對、靜態與動態 A/AAAA 上游，以及有界轉送；
- Layer 4 連線准入、工作階段記錄與 `l4_*` 指標；
- 網站位址與 HTTPS 連接埠驗證更貼近 Caddyfile；
- `map`、`invoke`、請求範圍存取記錄欄位，以及 `handle_errors` 內的
  `reverse_proxy`；以及
- 停滯的請求本文寫入、升級連線半關閉與 HTTP/3 協定錯誤回報的傳輸層修正。

## ✅ 預覽版支援範圍

| 領域 | 支援 |
| --- | --- |
| HTTP | 以同一份設定提供 HTTP/1.1、HTTP/2 與 HTTP/3。 |
| TLS | 公開 ACME 憑證、持續保存的內部憑證授權單位、手動憑證檔案，以及 Layer 4 監聽器的 TLS 直通。 |
| 靜態檔案 | 壓縮、range、條件式請求、預先壓縮檔案與 Markdown 協商。 |
| 反向代理 | 多個上游、負載平衡政策、健康檢查、重試、斷路器與有界過載佇列。 |
| FastCGI | HTTP/1.1、HTTP/2 與 HTTP/3 上的 `php_fastcgi`。 |
| Layer 4 | 依 TLS SNI、ALPN 或來源位址路由 TCP；靜態與動態 DNS 上游；有界准入與轉送；記錄與指標。 |
| 可觀測性 | HTTP 與 Layer 4 的結構化存取記錄、程序記錄與 Prometheus 指標。 |
| 管理 | Admin API 讀取、設定載入與重新載入。 |
| 設定 | Caddyfile 結構；Caddy 未定義的能力使用 nginx 名稱。 |

## 🛡️ 伺服器刻意拒絕的名稱

Pingclairfile 接受[指令參考](/zh-TW/reference/directives/)列出的 Caddyfile 形式。
此建置認得但未實作的名稱會在驗證時被拒絕，錯誤訊息會指出缺少的功能；不會被當成
不執行任何動作的設定接受。

重要邊界：

- 不提供 Caddy 模組、外掛或原生 Caddy JSON application schema。
- 憑證簽發者選擇與自訂 ACME directory 仍限制在指令參考列出的選項。
- 目前版本不轉送 HTTP request trailers，也不提供零中斷的程序重新啟動。
- `layer4` 是有界的 TCP 子集，不是完整的 caddy-l4 語法相容性。

## 🔌 Layer 4 邊界

Layer 4 監聽器僅支援 TCP。目前限制如下：

- 不支援 UDP；
- 不支援 TLS termination；
- 入口與上游都不支援 PROXY protocol；
- `layer4` 不提供萬用字元 SNI 匹配器；
- 每個區塊只能有一個監聽位址；
- 每條路由只能有一個靜態或動態上游；
- 每條路由只能有一個 `proxy` 處理常式；以及
- 不提供主動健康檢查或加權負載平衡。

HTTP PROXY protocol 與其餘 caddy-l4 proxy 語法分別記錄於
[#345](https://github.com/dorianverlaine/pingclair/issues/345) 與
[#346](https://github.com/dorianverlaine/pingclair/issues/346)。

## ⚠️ 其他已知限制

- HTTP/1.1 的已知長度回應會在本文完成時才送出；SSE 路由與
  `flush_interval -1` 路由仍會串流
  ([#296](https://github.com/dorianverlaine/pingclair/issues/296))。
- 未宣告的 HTTP/1 請求尾部欄位會被丟棄，可能遺失 `aws-chunked` 校驗碼
  ([#257](https://github.com/dorianverlaine/pingclair/issues/257))。
- 回應快取不在 HTTP/3 路徑儲存或提供回應
  ([#297](https://github.com/dorianverlaine/pingclair/issues/297))。
- 上游 `103 Early Hints` 會到達 HTTP/1.1 與 HTTP/3 用戶端；HTTP/2 路徑仍會丟棄
  ([#207](https://github.com/dorianverlaine/pingclair/issues/207))。
- 程序重新啟動仍有 listener handoff 空窗；支援的政策變更應使用 reload
  ([#294](https://github.com/dorianverlaine/pingclair/issues/294))。
- OpenTelemetry tracing 尚未提供，需先完成額外負擔量測
  ([#341](https://github.com/dorianverlaine/pingclair/issues/341))。

<span id="-known-defects-in-023"></span>

## 🔁 升級至此預覽版

預設安裝器仍會選取最新穩定版。安裝精確的 `v0.3.0-alpha.1` 二進位檔或容器標籤、
驗證預備設定及保留回退路徑，見[升級與移除](/zh-TW/start/upgrade/)。

## 🐛 回報問題

請在 [Pingclair issue tracker](https://github.com/dorianverlaine/pingclair/issues)
回報程式或文件問題。

## 📚 相關頁面

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)：
  發行變更與升級說明。
- [Layer 4 指南](/zh-TW/guides/layer4/)：TCP 路由設定與邊界。
- [架構](/zh-TW/concepts/architecture/)：HTTP 與 Layer 4 的執行路徑。
