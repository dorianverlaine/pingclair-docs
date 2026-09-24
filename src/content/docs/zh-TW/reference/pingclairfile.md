---
title: Pingclairfile
h1_emoji: '📖'
description: Pingclairfile 的結構，包括詞法規則、網站位址、匹配器、路由順序、片段，以及檢查它的工具。
---

Pingclairfile 是 Pingclair 的設定檔，以 Caddyfile 語言撰寫：開頭是可有可無的全域選項區塊，接著每個網站一個區塊，區塊裡放指令。只使用受支援指令的 Caddyfile，可以不經修改直接載入。本頁說明語言本身；各指令的作用則請見[指令參考](/zh-TW/reference/directives/)。

📌 本頁描述的是最新公開的發行版 **v0.2.0-rc.3**。

## 🔤 詞法規則

| 規則 | 說明 |
| --- | --- |
| 註解 | 從 `#` 到行尾。 |
| 引號 | 含有空白的值以 `"` 括起來。解析值之前會先移除引號。 |
| 時間長度 | 必須帶單位：`30s`、`5m`、`1h`。在需要時間長度的地方寫單獨的數字會被拒絕。 |
| 大小寫 | 指令與選項名稱一律小寫。 |
| 佔位符 | `{host}`、`{path}`、`{args[0]}`、`{block}` 以及其餘佔位符，會在指令文件說明的位置展開。 |

## 🌐 位址

網站區塊以它的位址命名。位址決定網站監聽哪個連接埠，以及是否透過 HTTPS 提供。

```text
example.com {          # HTTPS on 443 with a public certificate; 80 redirects
example.com:8443 {     # HTTPS on 8443: a host with a port is still HTTPS
localhost:8080 {       # HTTPS on 8080, from the internal authority
:8080 {                # plaintext HTTP on 8080, for any host
http://example.com {   # plaintext HTTP on 80
```

帶連接埠但沒有 scheme 的主機會透過 HTTPS 提供，與 Caddy 相同。在位址前面寫上 `http://`，就能在任何連接埠上要求明文。共用同一個連接埠的兩個網站在 TLS 上必須一致，否則設定會被拒絕。

## 🧭 匹配器

匹配器把指令限制在部分請求上。它可以直接寫在行內，例如 `/api/*` 這樣的路徑，也可以用 `@name` 宣告一次，之後以名稱引用。

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

`handle` 區塊把多個指令組成一條路由。同層的 `handle` 區塊彼此互斥：恰好只有其中一個會執行，沒有匹配器的 `handle` 則是網站的後備路由。在 v0.2.0-rc.3 中，執行的是匹配路徑最具體的那個。**下一版**：執行排序最前面的那個，較長的路徑排在較短的之前，其餘依檔案中的順序（見[哪一條路由回應](#-哪一條路由回應)）。

`client_ip` 匹配套用 `trusted_proxies` 之後的用戶端位址。**下一版**：`remote_ip` 改為匹配連線本身的對端，與 Caddy 相同；在 v0.2.0-rc.3 中，兩者匹配的都是轉送過來的用戶端。

## 🧭 哪一條路由回應

在 v0.2.0-rc.3 中，當好幾條路由都匹配同一個請求時，由路徑最具體的那一條回應，不論它寫在哪裡。

**下一版**：路由依 Caddy 的指令順序嘗試，第一個匹配的負責回應。例如 `respond` 排在 `file_server` 前面，所以在下面這個網站中，`/assets/a.txt` 會得到 `hello`，而不是那個檔案：

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

若要讓較窄的路由維持在前面，可以把路由包進 `handle` 區塊、用全域的 `order` 選項移動某個指令，或把路由列在 `route` 區塊裡，它會保留書寫順序。

## 🧩 片段與匯入

片段是可重用的設定。以 `(name) { ... }` 宣告的片段，用 `import name` 引入，並可以接收呼叫端傳來的區塊：

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

`{args[0]}` 是片段名稱之後的第一個參數，`{block}` 則是呼叫端提供的區塊。呼叫端沒有提供區塊時，`{block}` 會展開成空白，片段仍然可以編譯。

## 🧰 命令列工具

撰寫設定時，有三個命令可以幫忙：

- `pingclair validate` 編譯檔案，並指出第一個問題。
- `pingclair adapt --pretty` 印出檔案編譯後的 JSON。
- `pingclair fmt` 格式化檔案。

[命令列](/zh-TW/reference/command-line/)列出了所有子命令與旗標。

## 🚫 不屬於這個語言的部分

Caddyfile 語言定義的指令與選項比 Pingclair 實作的多。Pingclair 認得但沒有實作的名稱，會在載入檔案時被拒絕，訊息會指出缺少的功能，所以設定永遠不會在某個設定被悄悄丟掉的情況下執行。完整清單保存在伺服器儲存庫的 README 中，[專案狀態](/zh-TW/project/status/)則提供摘要。
