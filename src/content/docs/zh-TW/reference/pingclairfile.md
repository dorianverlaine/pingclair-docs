---
title: Pingclairfile
h1_emoji: '📖'
description: 設定語言本身：檔案結構、位址、matcher、snippet 與工具鏈。
---

Pingclairfile 是設定語言，遵循 Caddyfile 的慣例：一個選用的 global options 區塊，接著是內含 directive 的 site block。本頁說明語言本身；它接受的指令請見[指令參考](/zh-TW/reference/directives/)。

## 🔤 詞法規則

| 規則 | 說明 |
| --- | --- |
| 註解 | `#` 延伸到行尾。 |
| 引號 | 含空白的值以 `"` 包住。引號會在剖析前移除。 |
| 時間長度 | 必須帶單位：`30s`、`5m`、`1h`。在需要時間長度的地方寫裸數字會被拒絕。 |
| 大小寫 | directive 與選項名稱使用小寫。 |
| Placeholder | `{host}`、`{path}`、`{args[0]}`、`{block}` 等 placeholder 會在 directive 文件所述的位置展開。 |

## 🌐 位址

Site block 以位址命名。位址決定 listener，而對公開名稱而言，也決定自動 HTTPS 是否適用。

```caddyfile
example.com {              # host: ports 443 and 80, automatic HTTPS
localhost:8080 {           # host and port
:8080 {                    # any host on this port
http://example.com {       # force plaintext
```

連接埠屬於位址，而不是另一個獨立的 `listen` directive，因此位址與 listener 不可能互相矛盾。

## 🧭 Matcher

接受 matcher 的 directive 只會套用到符合的請求。Matcher 可以寫在行內，也可以宣告為 `@name` 後以名稱引用。

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` 區塊依路由群組 directive；不帶 matcher 的 `handle` 是該 site 的 fallback。

## 🧩 Snippet 與 import

Snippet 是可重複使用的片段。以 `(name) { ... }` 宣告、以 `import name` 引入，並可接收呼叫端提供的區塊：

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

沒有接到內容的 placeholder 不會插入任何東西，因此寫了 `{block}` 的 snippet 在呼叫端未提供區塊時依然能編譯。

## 🧰 命令列工具

命令列有自己的一頁參考：[命令列](/zh-TW/reference/command-line/) 列出每個子指令
及其旗標與預設值。寫設定時用得上的是其中三個：`pingclair validate` 編譯檔案並
指出第一個問題，`pingclair adapt --pretty` 印出該檔案編譯出的 JSON，
`pingclair fmt` 負責格式化。

## 🚫 不屬於語言的部分

格式定義的名稱多於伺服器實作的數量。已辨識但沒有實作的名稱，會在載入時以名稱拒絕，並附上「功能不存在」的訊息。權威清單維護在伺服器倉庫的 README，[專案狀態](/zh-TW/project/status/)頁面則整理了主要類別。
