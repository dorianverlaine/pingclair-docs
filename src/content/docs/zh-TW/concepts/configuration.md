---
title: 設定模型
h1_emoji: '🧠'
description: Pingclairfile 的結構、它在任何請求抵達前如何被編譯與驗證、路由如何被選出，以及重載會改變什麼。
---

Pingclairfile 只在載入時編譯一次，變成伺服器實際執行的狀態。這帶來兩個結果，而它們解釋了 Pingclair 大部分的行為。第一，凡是設定就能決定的工作，例如解析位址或編譯匹配器，都在第一個請求之前完成，而不是每個請求都做一次。第二，無法兌現的設定會在載入時就讓伺服器停下，而不是等到某個沒人測過的請求才出錯。本頁描述的是 **v0.2.0-rc.3**。

## 🗂️ 檔案由全域選項與網站區塊組成

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

- **全域選項**寫在檔案最上方一個沒有名稱的區塊裡。它們設定不屬於任何單一網站的事：ACME 帳號的 email、Admin API、自動 HTTPS、受信任的代理，以及主機名稱上游的 DNS 重新解析。[指令參考](/zh-TW/reference/directives/#global-options)列出了所有全域選項。
- **網站區塊**以位址命名：主機、連接埠，或兩者皆有。連接埠是位址的一部分，而不是另一個指令，所以位址與監聽器不可能互相矛盾。
- **指令**是網站區塊內的敘述。有些接受參數，有些接受巢狀區塊，有些兩者都接受。
- **註解**以 `#` 開頭，直到該行結尾。
- **含有空白的值要加引號。**時間長度必須帶單位：`30s` 是三十秒，在需要時間長度的地方寫一個單獨的 `30` 會被拒絕。

## 🧭 匹配器選出指令適用的請求

具名匹配器以 `@name` 宣告，使用時把名稱寫在指令後面：

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

`handle` 區塊把同一條路由的指令放在一起。一個請求只會由一個 `handle` 區塊回應，而沒有匹配器的 `handle` 會接住其他區塊沒接到的所有請求：

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

## 🚦 哪一條路由回應請求

當網站裡有好幾條路由都匹配同一個請求時，只能由其中一條回應。在 v0.2.0-rc.3 中，路徑最具體的路由勝出，不論它寫在檔案的哪個位置。

📌 **下一版**（不相容變更）。在 `main` 上，路由改為遵循 Caddy 的指令順序：指令依種類排序（例如 `respond` 排在 `file_server` 與 `reverse_proxy` 前面），依此順序第一條匹配的路由負責回應。如果你的網站依賴一條寫在較寬路由下方、而那條較寬路由的排序又比較前面的窄路由，升級後回應就會不同。有兩種寫法能讓兩個版本得到相同的結果：把每條路由放進各自的 `handle` 區塊（上面的範例就是這樣做），或把路由列在 `route` 區塊裡，它會保留書寫順序。完整的排序記錄在 [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) 的 Unreleased 底下。

## 🧩 以片段與匯入重複使用設定

片段（snippet）是以 `(name) { ... }` 宣告、以 `import name` 插入的可重用設定。呼叫端可以傳入參數與一個區塊；片段在寫著 `{block}` 的地方接收那個區塊：

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

在被匯入的檔案中定義的片段，後續的匯入都看得到。指令參數清單內的佔位符會被拒絕：Caddy 在插入片段後會重新讀取那一行，而 Pingclair 的 parser 做不到，所以它會直接說明，而不是去猜那一行原本想寫什麼。

## 🛡️ 驗證會拒絕伺服器做不到的事

`pingclair validate` 會編譯檔案，並執行語法以外的檢查：指令參數、匹配器語法、憑證與金鑰檔案是否存在，以及政策限制，例如哪些對端可以設定用戶端身分相關的標頭。

沒通過這些檢查的設定不會執行。判斷失敗與否的規則有三條：

- **未實作的名稱會被指名拒絕。**Pingclair 認得 Caddyfile 格式定義的每一個名稱。對於沒有實作的名稱，它會回報該功能不存在；絕不會把它當成拼錯的字，也絕不會默默忽略。
- **無法兌現的選項會被拒絕，而不是降級。**`encode br` 是編譯錯誤，因為沒有串流式的 Brotli 編碼器；伺服器不會悄悄改用 gzip。
- **語法正確但指向不存在的檔案，仍然是錯誤。**伺服器儲存庫中的 `examples/full_featured.pingclair` 語法正確，但在它所指的憑證路徑不存在的機器上，`validate` 仍會拒絕它。

伺服器載入檔案時也會執行相同的檢查，重載時也一樣。

## 🔁 重載在不重啟的情況下替換設定

重載會重新讀取檔案、編譯，並在行程持續執行的同時把結果換上去。如果新檔案編譯失敗，先前的設定會繼續提供服務。要求重載有三種方式：

- `pc service reload`（或 `systemctl reload pingclair`）透過已安裝的 unit 送出 `SIGUSR1`。
- `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` 直接送出同一個訊號。
- `pingclair reload` 透過 Admin API 進行，並印出伺服器的判定結果。它需要 `admin` 全域選項。

`systemctl reload` 只能回報訊號已送達，所以伺服器的判定結果會出現在 unit 的狀態列與 journal 中。

有些變更無法透過重載套用；這時伺服器會拒絕重載並保留舊設定，而不是只套用其中一部分：

- **監聽器的變更。**新增、移除或搬移位址，或讓監聽器在明文與 TLS 之間切換，都需要重啟，因為監聽 socket 是在啟動時建立的。
- **全域選項。**啟動時就確定的選項（例如 `trusted_proxies`）作用於整個行程，所以全域選項區塊的任何變更都需要重啟。
- **憑證拓撲。**新增 TLS 主機名稱，或改變網站取得憑證的方式，都需要重啟。

拒絕訊息會指出是哪一項變更，例如 `listener topology changed (added:
…, removed: …)`；執行 `sudo pc service restart` 即可套用。

[以服務方式執行](/zh-TW/start/service/#-重載意味著什麼)展示了每種結果看起來的樣子。

## 🧭 相關頁面

- [Pingclairfile](/zh-TW/reference/pingclairfile/)：完整的語言說明。
- [指令參考](/zh-TW/reference/directives/)：所有指令與選項。
- [架構](/zh-TW/concepts/architecture/)：執行編譯後設定的是什麼。
