---
title: 設定模型
h1_emoji: '🧠'
description: Pingclairfile 如何被解析、編譯、驗證，並轉換成執行期狀態。
---

Pingclairfile 在載入時編譯一次，成為伺服器實際執行的執行期狀態。由此產生兩個結果，也解釋了這個專案大部分的行為：設定能決定的事都在第一個請求之前完成；而無法被滿足的設定會讓伺服器停止，而不是在請求當下妥協。

## 🗂️ 檔案結構

檔案包含一個選用的 global options 區塊，後面接著一或多個 site block。

```caddyfile
{
    email admin@example.com
}

example.com {
    encode zstd gzip
    reverse_proxy 10.0.0.10:8080 10.0.0.11:8080
}

:8080 {
    file_server ./public
}
```

- **Global options** 寫在檔案最前面、沒有名稱的區塊裡，用於設定不屬於單一 site 的狀態：ACME 帳號信箱、Admin API、自動 HTTPS 行為、trusted proxies，以及主機名上游的 DNS 重新解析。可用選項列在[指令參考](/zh-TW/reference/directives/#global-options)。
- **Site block** 以位址命名：主機、連接埠，或兩者兼具。連接埠屬於位址的一部分，而不是另一個獨立指令，因此只有一個地方需要保持兩者一致。
- **Directive** 是 site block 內的敘述句。有些接受參數串列，有些接受巢狀區塊，有些兩者都接受。
- **註解**以 `#` 開始，延伸到行尾。
- **含空白的值要加引號。** 時間長度要帶單位：`30s` 是三十秒，而在需要時間長度的地方寫裸數字 `30` 會被拒絕。

## 🧭 Matcher

Matcher 用來選出某個 directive 要套用到哪些請求。具名 matcher 以 `@name` 宣告，之後以名稱引用：

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

`handle` 區塊依路由群組化行為，並支援不帶 matcher 的 fallback：

```caddyfile
example.com {
    handle /assets/* {
        file_server ./assets
    }

    handle {
        respond "Page Not Found" 404
    }
}
```

## 🧩 Snippet 與 import

Snippet 是可重複使用的片段，以 `(name) { ... }` 宣告，並用 `import name` 引入。Snippet 也能接收呼叫端提供的區塊，並把它插入到片段中寫 `{block}` 的位置：

```caddyfile
(site) {
    https://{args[0]} {
        {block}
    }
}

import site example.com {
    reverse_proxy 127.0.0.1:3000
}
```

在被 import 的檔案裡定義的 snippet，對之後的 import 是可見的。放在參數串列中的 placeholder 會被拒絕，因為 directive 樹無法像 token 層那樣在插入後重新解析該行。

## 🛡️ 驗證

`pingclair validate` 會編譯檔案並套用語意檢查：指令參數、matcher 語法、憑證與金鑰路徑，以及諸如「哪些對端可以宣稱用戶端身分標頭」之類的策略限制。

失敗一律明確且封閉：

- **未實作的名稱會以名稱拒絕。** 格式定義的每個名稱都會被辨識，伺服器未實作的會產生「功能不存在」的訊息。它不會被當成拼字錯誤，也不會被忽略：含有這類名稱的設定不會啟動。
- **無法兌現的選項會被拒絕，而不是降級。** 例如在 `encode` 中指定 Brotli 會是編譯錯誤，因為代理沒有串流 Brotli 編碼器；伺服器不會悄悄改用 gzip。
- **語法正確但引用不存在素材的檔案仍會被拒絕。** 倉庫中的 `examples/full_featured.pingclair` 是合法的 Caddyfile 語法，但仍然會被拒絕，而且理由正確：它指名的憑證路徑不存在於執行檢查的機器上。

同樣的檢查會在載入時執行，因此重新載入時若設定驗證失敗，先前的狀態會保持不變。

## 🔁 重新載入

重載會重新讀取設定，而不重啟行程。訊號是 `SIGUSR1`：

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pingclair reload` 透過 Admin API 走到同一段程式碼，並回報伺服器對檔案的判斷，需要在全域選項區塊裡寫 `admin`。

`pc service reload` 透過安裝出來的 unit 送出這個訊號，所以那條理所當然的指令就是能用的指令。答案不在結束碼裡——`systemctl reload` 只能回報訊號已經送達——而在 unit 的 status line 與日誌裡；被拒絕的重載會讓舊設定繼續執行（[issue #66](https://github.com/dorianverlaine/pingclair/issues/66) 記錄的是那個即使如此也回報成功的 unit 版本）。於啟動階段建立的行程級策略，例如 `trusted_proxies`，要在重啟後才會生效；改動監聽器的設定同樣需要重啟。
