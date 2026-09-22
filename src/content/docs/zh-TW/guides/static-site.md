---
title: 提供靜態網站
h1_emoji: '🗂️'
sidebar:
  order: 2
description: 提供目錄服務，帶壓縮、快取標頭、範圍請求、單頁應用後備，以及一條讓點開頭檔案保持私密的規則。
---

提供檔案是 Pingclair 的另一半工作。本頁從 `root` 與 `file_server` 開始，一路加上
壓縮、快取標頭、範圍請求與單頁應用所需後備，並展示每一步伺服器實際回傳什麼。

## 🧾 開始之前

- 已經安裝並執行 Pingclair（[安裝](/zh-TW/start/install/)），實驗期間先停掉服務：
  `sudo pc service stop`。
- 一個要提供服務的目錄。範例用 `/srv/site`。

## 📁 提供目錄

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

`root *` 為每個請求設定站台根目錄，`file_server` 從那裡提供服務。不存在的路徑
回 `404`。

## 🗜️ 壓縮

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

參數依偏好順序排列。同一個 36 KB 文字檔，用三種 `Accept-Encoding` 請求，在這套
設定上實測：

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli 在代理回應上沒有實作，要求它會得到編譯錯誤而不是靜默降級：

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

訊息給出了替代方案，這正是重點：要求伺服器無法兌現的東西，設定根本不會執行。

## ⏳ 快取標頭

`file_server` 已經會回應條件請求 —— 上面的 `ETag` 與 `Last-Modified` 就是用戶端在
`If-None-Match` 或 `If-Modified-Since` 裡回送的值。保存多久由你決定，而且應該寫在
它成立的那些路徑上：

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

實測：頁面上是 `Cache-Control: public, max-age=60`，`/assets/*` 上是
`public, max-age=31536000, immutable`。只有檔名隨內容變化時，immutable 才誠實，
這也正是建置工具在檔名裡加雜湊的原因。

範圍請求不需要任何設定；要求前十個位元組的用戶端就能拿到它們：

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 單頁應用

在瀏覽器裡做路由的應用，需要所有未知路徑都回傳入口文件，同時真實檔案繼續正常
提供：

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

實測：`/assets/big.txt` 仍然以自己的內容回 `200`，`/some/spa/route` 用
`index.html` 回 `200`。沒有那行 `try_files`，第二個請求就是 `404`。

## 🗂️ 目錄列表

`file_server browse` 會為沒有 index 檔案的目錄繪製列表：

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

列表會列出項目，所以 `/assets/` 會在 `Index of` 標題下顯示 `big.txt`。除非這個
目錄本來就該這樣被讀，否則不要加 `browse`。

## 🔒 隱藏檔案

⚠️ 點開頭的檔案和其他檔案一樣會被提供：在上面的設定裡 `.hidden` 回了 `200`，
`.git`、`.env` 與編輯器備份就是這樣跑到公網上的。要把它們擋在外面，就讓回應發生
在檔案伺服器之前：

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

實測：`/.hidden` 回 `404`，而 `/` 與 `/assets/big.txt` 仍然是 `200`。用 `404`
而不是 `403` 是刻意的 —— `403` 等於確認該檔案存在。

## ⚠️ 出問題時

- **`Unsupported feature: 'encode br'`。** Brotli 被按名字拒絕；請用
  `encode zstd gzip`。
- **`Unknown directive 'file_server: …'`。** 該選項不存在，`validate` 會指明它
  拒絕的寫法，而不是忽略它。
- **出來的是目錄列表而不是頁面。** 該目錄沒有 `index.html`，要麼是你要的效果，
  要麼是檔案漏放了。
- **應用負責的路由回 `404`。** 缺單頁後備：`try_files {path} /index.html`。
- **重載後新頁面不出現。** 重載套用的是策略，不是新的監聽器；檔案本身依請求讀取，
  所以加檔案是即時的，移動監聽器不是，見
  [以服務方式執行](/zh-TW/start/service/#-重載意味著什麼)。

## 🧭 下一步

- [反向代理一個應用](/zh-TW/guides/reverse-proxy/)：伺服器的另一半。
- [`file_server`](/zh-TW/reference/directives/#file_server)：指令參考。
- [`try_files`](/zh-TW/reference/pingclairfile/)：後備是如何編譯的。
