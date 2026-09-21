---
title: 架構
description: 伺服器的組成元件，以及請求經過它們的路徑。
---

## 🧱 組成元件

Pingclair 是一個 Cargo workspace。實際執行的伺服器是 `pingclair` 二進位檔，它連結下列 crate。

| Crate | 職責 |
| --- | --- |
| `pingclair` | 命令列入口：參數解析、日誌、啟動流程與服務包裝。 |
| `pingclair-config` | 設定編譯器：lex、parse 並檢查 Pingclairfile 的語意。 |
| `pingclair-proxy` | 基於 Pingora 的 HTTP/1.1 與 HTTP/2 代理、基於 quiche 的 HTTP/3 listener、負載平衡，以及共用的請求策略層。 |
| `pingclair-static` | 靜態檔案供應：檔案讀取、MIME 類型、range 請求與串流。 |
| `pingclair-tls` | 憑證管理：手動憑證、常駐的內部憑證授權單位，以及自動 ACME 簽發。 |
| `pingclair-api` | 用於檢視狀態與重新載入設定的 Admin API。 |
| `pingclair-core` | 上述 crate 共用的資料結構與伺服器生命週期。 |

## 🚦 請求的路徑

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

兩種傳輸最後都匯流到同一個策略層，因此路由、標頭處理、速率限制與存取日誌在 HTTP/1.1、HTTP/2、HTTP/3 上的行為一致。只有在協定本身要求不同時，兩種傳輸才會出現差異。

## 🌊 請求處理特性

- **Body 以串流處理。** 請求與回應的 body 以有界區塊流經代理。壓縮、中介層與代理都不會緩衝完整 body，因此大型上傳或緩慢的讀取端不會佔用與 body 大小成正比的記憶體。
- **上游連線會被重複使用。** 與後端之間的 keepalive 連線會重複使用。主機名上游會依 `dns_refresh` 設定的間隔重新解析，因此重新啟動並取得新位址的容器不需要人工介入即可跟上。
- **執行期狀態在請求期間不可變。** 請求讀取的是已發布的 snapshot；重新載入會發布新的 snapshot，而不是修改正在使用的這一份。

## 🌐 各協定的差異

部分行為依協定而異，這是刻意的設計。這裡先列出，而不是讓使用者事後才發現：

| 領域 | 行為 |
| --- | --- |
| Trailers | 請求中宣告的 trailer 不會被轉送。伺服器會在回應送出前回 `501`、對已送出的 HTTP/3 串流發出 reset，並在上游宣告回應 trailer 時回 `502`。 |
| CONNECT | 在 HTTP/3 上，`CONNECT` 與 extended `CONNECT` 會回 `501`，直到 tunnel 支援實作為止。 |
| FastCGI | `php_fastcgi` 支援 HTTP/1.1 與 HTTP/2。需要 FastCGI 的路由在 HTTP/3 上會回 `501`，直到該路徑擁有自己的 FastCGI client。 |

## ⚠️ 已知缺陷

WebSocket 升級在負載下會間歇性失敗：在忙碌的機器上約有 10-15% 的升級失敗。原因是上游 `pingora-proxy` crate 的競態，而不是 Pingclair 自己的升級處理；而且在閒置的開發機上完全看不到，所以必須寫在這裡。上游 issue：[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)。
