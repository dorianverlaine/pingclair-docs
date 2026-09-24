---
title: 提供 HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: 開啟 HTTP/3、證明用戶端真的用了它，並了解哪些請求在 QUIC 上的行為不同。
---

HTTP/3 預設就是開啟的：除非全域協定清單排除了 `h3`，否則 HTTPS 網站都會在 UDP 443 上得到一個 QUIC 監聽器。需要小心的是如何證明用戶端真的用了它，因為悄悄退回 HTTP/2 的用戶端，看起來和成功一模一樣。

📌 本頁描述的是最新公開的發行版 **v0.2.0-rc.3**。只存在於伺服器 `main` 分支上的變動，以 **下一版** 標示。

## 🧾 開始之前

- 一個解析到這台主機的名稱，以及它的憑證（[HTTPS](/zh-TW/start/https/)）。
- 在供應商與主機的防火牆上都**開放 UDP 443**。QUIC 沒有後備方案：UDP 被擋住時，用戶端會改用 HTTP/2，而且完全不會提起。
- 支援 HTTP/3 的用戶端。多數發行版內建的 `curl` 都不支援——硬要用的話，它會明確告訴你：

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 開啟

```caddyfile
{
    email bonjour@pingclair.com
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

網站執行時在主機上實測：

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

從清單中移除 `h3`，這個監聽器就會消失；這份清單就是開關（[TLS：可以調整什麼](/zh-TW/guides/tls-tuning/#-提供哪些協定)）。沒有 `protocols` 這一行時，HTTP/3 維持開啟。

`tls` 區塊也接受個別網站的開關：

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

⚠️ 在 v0.2.0-rc.3 中，`http3 off` 會被接受，但沒有任何效果：網站仍會透過 QUIC 提供。**下一版**：它會讓該網站不走 QUIC，監聽器則繼續為其他網站提供服務，該網站的回應也不再於 `Alt-Svc` 中宣告 HTTP/3。

## ✅ 證明用戶端用了它

證據要從用戶端取得。任何以 ngtcp2 或 quiche 建置的 curl 都可以；在 curl 不支援 HTTP/3 的主機上，用容器是取得它最快的方式：

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

`--network host` 讓容器直接使用主機的網路。少了它，請求可能會經過一個擋掉 QUIC 的網路命名空間。

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

答案就在第一行：狀態列寫的是 `HTTP/3`，而不是 `HTTP/2`。對同一個 URL 分別用 `--http2` 與 `--http1.1` 請求，會顯示另外兩種協定，這就確認了用戶端沒有退回。

沒有容器可用時，若系統的 OpenSSL 是 3.5 或更新版本，可以用它檢查 QUIC 交握：

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` 加上通過驗證的憑證鏈，證明 QUIC 監聽器會以用戶端信任的憑證回應這個名稱。但它無法證明完整的 HTTP/3 請求可以運作；那要靠 curl 的檢查。

## 🧭 HTTP/3 上有什麼不同

HTTP/3 與 HTTP/1.1、HTTP/2 共用政策程式碼，所以路由、匹配器、標頭、速率限制、FastCGI 與存取日誌的行為都相同。差異出現在 HTTP/3 無法承載某些東西的地方：

| 領域 | 在 HTTP/3 上 |
| --- | --- |
| 宣告的 request trailers | 不轉送：回應確定送出前回 `501`，之後則重設 stream。 |
| 上游回應的 trailers | `502`。 |
| `CONNECT` | Pingclair 不建立 tunnel。**下一版**：回應附帶 `Allow` 的 `405`，與 HTTP/1.1 和 HTTP/2 相同。 |

源站前面若有 CDN，CDN 會自己終結 HTTP/3，再以 HTTP/1.1 或 HTTP/2 與源站溝通。這時這裡的監聽器完全無法告訴你訪客的瀏覽器用了什麼；請改查 CDN 本身的 HTTP/3 設定。

## ⚠️ 無法運作時

- **`option --http3: the installed libcurl version doesn't support this`。**用戶端不支援 HTTP/3；請照上面的方式使用容器。
- **`curl --http3` 卡住或逾時。**UDP 443 在某處被擋住了。請先檢查供應商的防火牆或安全群組，再檢查主機本身的。
- **主機上沒有 UDP 監聽器。**`servers` 的協定清單中少了 `h3`，或正在執行的檔案不是你編輯的那一份（[重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)）。
- **HTTP/3 在本機可以用，從外部卻不行。**用戶端的網路擋掉了 UDP 443，這在企業與飯店網路上很常見；瀏覽器會悄悄退回。
- **設定了 `http3 off` 的網站仍以 HTTP/3 回應。**在 v0.2.0-rc.3 中這個選項沒有效果；如果所有網站都不該使用 HTTP/3，請從全域清單中移除 `h3`。

## 🧭 下一步

- [TLS：可以調整什麼](/zh-TW/guides/tls-tuning/)：協定清單、憑證與用戶端憑證。
- [專案狀態](/zh-TW/project/status/)：這個發行版支援、拒絕，以及已知有問題的項目。
- [`tls`](/zh-TW/reference/directives/#tls)：`http3` 選項的完整脈絡。
