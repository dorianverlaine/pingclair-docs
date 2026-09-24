---
title: 提供靜態網站
h1_emoji: '🗂️'
sidebar:
  order: 2
description: 以壓縮、快取標頭、位元組範圍、單頁應用程式的後備路由，以及一條讓隱藏檔保持私密的規則來提供一個目錄。
---

本頁提供一個檔案目錄：從 `root` 與 `file_server` 開始，再加上壓縮、快取標頭、range 請求，以及單頁應用程式需要的後備路由。每一步都附上伺服器在真實主機上的回應。

📌 本頁描述的是最新公開的發行版 **v0.2.0-rc.3**。只存在於伺服器 `main` 分支上的變動，以 **下一版** 標示。

## 🧾 開始之前

- 已安裝並執行 Pingclair（[安裝](/zh-TW/start/install/)），實驗期間先停掉服務：`sudo pc service stop`。
- 一個要提供的目錄。範例使用 `/srv/site`。

## 📁 提供一個目錄

```caddyfile
http://:8080 {
    root * /srv/site
    file_server
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo systemctl restart pingclair
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Last-Modified: Tue, 22 Sep 2026 04:37:54 GMT
ETag: "5e-6ab20622"
Accept-Ranges: bytes
```

`root *` 為每個請求設定網站根目錄，`file_server` 則從那裡提供檔案。不存在的路徑會回應 `404`。

## 🗜️ 壓縮

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

`encode` 依偏好順序列出格式。同一個 36 KB 的文字檔，以三種不同的 `Accept-Encoding` 標頭請求：

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

代理的回應沒有實作 Brotli，要求使用它會是編譯錯誤，而不是悄悄降級：

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

訊息會指出替代方案。要求伺服器做不到的事的設定，根本不會執行。

在 v0.2.0-rc.3 中，沒有 `encode` 這一行的網站仍會用 gzip 壓縮；若要原樣提供磁碟上的位元組，請寫 `encode off`。**下一版**：網站只在 `encode` 要求的地方壓縮，與 Caddy 相同，所以升級時請保留 `encode` 這一行。

## ⏳ 快取標頭

`file_server` 會送出 `ETag` 與 `Last-Modified`，但在 v0.2.0-rc.3 中不會評估 `If-None-Match` 或 `If-Modified-Since`：重新驗證的用戶端會再下載一次整個檔案。**下一版**：條件式請求會以 `304 Not Modified` 或 `412 Precondition Failed` 回應。

用戶端可以保留一個檔案多久，是網站要做的決定，而且應該只設定在確實成立的路徑上：

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    header Cache-Control "public, max-age=60"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    file_server
}
```

實測：頁面上是 `Cache-Control: public, max-age=60`，`/assets/*` 上則是 `public, max-age=31536000, immutable`。只有在檔案內容一變、檔名就跟著變的情況下，`immutable` 才是安全的，這就是建置工具會在資源檔名中加入內容雜湊的原因。

range 請求不需要任何設定；要求前十個位元組的用戶端就會拿到它們：

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 單頁應用程式

在瀏覽器中處理路由的應用程式，需要每個未知路徑都回傳它的入口文件，同時真實存在的檔案仍然照常提供：

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

實測：`/assets/big.txt` 仍以它自己的內容回應 `200`，`/some/spa/route` 則以 `index.html` 回應 `200`。少了 `try_files` 這一行，第二個請求就會是 `404`。

## 🗂️ 目錄列表

`file_server browse` 會為沒有索引檔的目錄顯示列表：

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

列表會列出各個項目：`/assets/` 會在 `Index of` 標題下顯示 `big.txt`。除非這個目錄本來就是要讓人這樣瀏覽，否則不要開啟 `browse`。

## 🔒 隱藏檔案

⚠️ 以點開頭的隱藏檔會像其他檔案一樣被提供：在上面的設定中，`.hidden` 回應了 `200`。`.git`、`.env` 與編輯器的備份檔就是這樣流到網際網路上的。要把它們擋下，請在檔案伺服器之前先回應這些路徑：

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

實測：`/.hidden` 回應 `404`，`/` 與 `/assets/big.txt` 仍回應 `200`。狀態碼刻意用 `404` 而不是 `403`：`403` 等於承認檔案存在。`/.*` 只匹配網站最上層的隱藏檔；`file_server { hide … }` 選項則不論路徑在哪裡都能隱藏。

## ⚠️ 無法運作時

- **`Unsupported feature: 'encode br'`。**Brotli 會被指名拒絕；請使用 `encode zstd gzip`。
- **`Unknown directive 'file_server: …'`。**這個選項不存在，`validate` 會指出被拒絕的寫法，而不是忽略它。
- **出現目錄列表而不是頁面。**該目錄沒有 `index.html`，這要嘛正是你要的，要嘛是少了檔案。
- **應用程式處理的路由回應 `404`。**缺少單頁應用程式的後備路由：`try_files {path} /index.html`。
- **重載後變更沒有出現。**檔案是每個請求時才讀取的，所以新檔案不需重載就會立即出現。新增或搬移的監聽器則需要重啟（[以服務方式執行](/zh-TW/start/service/#-重載意味著什麼)）。

## 🧭 下一步

- [代理應用程式](/zh-TW/guides/reverse-proxy/)：伺服器的另一半。
- [`file_server`](/zh-TW/reference/directives/#file_server)：指令參考。
- [Pingclairfile](/zh-TW/reference/pingclairfile/)：匹配器與路由順序。
