---
title: 架構
h1_emoji: '🏗️'
description: 組成伺服器的各個 crate、請求穿過它們的路徑，以及 HTTP/1.1、HTTP/2 與 HTTP/3 行為不同的地方。
---

Pingclair 支援 HTTP/1.1、HTTP/2 與 HTTP/3。各傳輸層負責處理協定資料，共用的政策層則負責路由、標頭規則、速率限制與存取日誌。本頁說明 **v0.2.2** 的組成元件、請求處理流程與協定差異。

## 🧱 伺服器是由幾個 crate 組成的單一二進位檔

Pingclair 是一個 Cargo workspace。`pingclair` 二進位檔連結了下列 crate，每個 crate 只負責一件事。

| Crate | 職責 |
| --- | --- |
| `pingclair` | 命令列進入點：參數解析、日誌、啟動、關閉與重載。 |
| `pingclair-config` | 設定編譯器：讀取 Pingclairfile、檢查它，並產出伺服器實際執行的設定。 |
| `pingclair-proxy` | 基於 Pingora 的 HTTP/1.1 與 HTTP/2、基於 quiche 的 HTTP/3、負載平衡，以及共用的請求政策層。 |
| `pingclair-static` | 靜態檔案服務：讀檔、MIME 類型、range 與條件式請求，以及串流。 |
| `pingclair-fastcgi` | `php_fastcgi` 用來連到 PHP-FPM 的 FastCGI 用戶端。 |
| `pingclair-tls` | 憑證管理：憑證檔案、內部憑證授權單位，以及 ACME 簽發。 |
| `pingclair-api` | 用來檢視狀態與重新載入設定的 Admin API。 |
| `pingclair-core` | 上述 crate 共用的資料結構與生命週期。 |

## 🚦 每個請求都經過同一個政策層

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

傳輸層轉接器把協定的 frame 組成一個請求，再往下交出去。路由、標頭規則、速率限制與存取日誌只在政策層實作一次，所以在 HTTP/1.1、HTTP/2 與 HTTP/3 上的行為都一樣。兩種傳輸層也透過同一個 connector 連到上游，因此連線池、上游 TLS 與逾時設定同樣是共用的。

## 🌊 每個請求都成立的事

- **本文使用有界記憶體。** 代理預設串流傳送；明確設定的請求或回應緩衝會先保留到設定上限，再串流傳送其餘資料。`unlimited` 緩衝仍有 8 MiB 上限。壓縮與快取仍有[已知缺陷](/zh-TW/project/status/)，部署前請先確認。
- **上游連線會重複使用。** 連往後端的 keepalive 連線會放進連線池。以主機名稱指定的上游，會依 `dns_refresh` 設定的間隔重新解析，所以後端容器重啟換了位址，也不需要人工介入就能跟上。
- **請求執行期間，設定只會被讀取，不會被修改。** 每個請求讀的都是已發布的編譯後設定快照。重載會建立新的快照並替換上去；已經在執行的請求則在舊快照上完成。

## 🌐 各協定的差異

有幾項行為會因協定而不同。列在這裡，免得有人在正式環境中才發現。

| 領域 | v0.2.0 的行為 |
| --- | --- |
| Trailers | 任何協定都不轉送 request trailers。宣告了 trailers 的請求，會在回應開始前得到 `501`；若 HTTP/3 stream 的回應已經開始，則改為重設該 stream。上游回應若宣告了 trailers，會保留其狀態與本文，trailer 欄位則被丟棄。 |
| `CONNECT` | 可用的 `host:port` 目標得到附帶 `Allow` 的 `405`，沒有可用連接埠的目標得到 `400`；HTTP/1.1 拒絕後關閉連線。 |
| FastCGI | `php_fastcgi` 在每種協定上都能運作，包括 HTTP/3。 |

📌 `TRACE` 同樣得到附帶 `Allow` 的 `405`。HTTP/1 格式錯誤的 chunked 本文、含原始空白或控制字元的目標，以及缺少 Host 的 HTTP/1.1 請求，皆得到 `400` 並關閉連線。

## ⚠️ 負載下 WebSocket 升級會間歇性失敗

Pingclair 可以代理 WebSocket，但機器忙碌時大約有 10–15% 的升級會失敗。從外部看，失敗的升級就是在 `101 Switching Protocols` 回應之後連線立刻被關閉。原因是上游 `pingora-proxy` crate 中的一個競態條件，而不是 Pingclair 的升級處理，也沒有任何設定能避開它。閒置的開發機很少能重現，所以特別在這裡說明。依據：[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)。

## 🧭 相關頁面

- [設定模型](/zh-TW/concepts/configuration/)：Pingclairfile 如何變成上面描述的快照。
- [專案狀態](/zh-TW/project/status/)：這個發行版支援與拒絕的項目。

📌 其他已知串流與協定缺陷請見[專案狀態](/zh-TW/project/status/)。HTTP/3 取消請求會釋放等待中的上游交換，且不影響同一連線的其他串流。
