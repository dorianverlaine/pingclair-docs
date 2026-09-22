---
title: 提供 HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: 開啟 HTTP/3、證明用戶端真的用了它，並了解哪些請求在 QUIC 上行為不同。
---

HTTP/3 預設就是可用的：只要協定集合允許，伺服器就會在 UDP 443 上開啟 QUIC 監聽，
不需要安裝任何東西。需要小心的是驗證 —— 一個悄悄退回 HTTP/2 的用戶端，看起來和
成功一模一樣。

## 🧾 開始之前

- 一個解析到本機的網域，以及它的憑證（[HTTPS](/zh-TW/start/https/)）。
- 在服務商防火牆與主機上都**開放 UDP 443**。QUIC 沒有後備：UDP 被擋住時，用戶端
  用 HTTP/2，而且不會告訴你。
- 一個支援 HTTP/3 的用戶端。多數發行版內建的 `curl` 不支援，直接要它會明說：

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

站台執行中，在主機上實測：

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

把 `h3` 從列表裡去掉，這個監聽就消失；那個列表就是開關
（[TLS 能調什麼](/zh-TW/guides/tls-tuning/#-which-protocols-are-served)）。也可以
在不停止監聽的情況下，把單一站台移出 HTTP/3：

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

## ✅ 證明用戶端用了它

伺服器的存取日誌不會寫明協定，所以證據來自用戶端。任何用 ngtcp2 或 quiche 建置的
curl 都行；在只有不支援 HTTP/3 的 curl 的主機上，用容器最快：

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

`--network host` 讓容器使用主機的 UDP 路徑；不加的話，請求可能經過一個阻斷 QUIC 的
網路命名空間。

第一行就是全部答案：狀態行寫的是 `HTTP/3`，不是 `HTTP/2`。用 `--http2` 與
`--http1.1` 請求同一個 URL 會顯示另外兩個，從而證明用戶端並不是在悄悄後退。

無法使用容器時，可以用系統的 OpenSSL（3.5 或更新）檢查 QUIC 握手：

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` 加上驗證通過的憑證鏈，說明該網域的 QUIC 監聽用用戶端信任的
憑證應答了。它並不證明一次完整的 HTTP/3 請求 —— 那是 curl 檢查的任務。

## 🧭 HTTP/3 上有什麼不同

策略層與 HTTP/1.1、HTTP/2 共用，所以路由、matcher、標頭、限速與存取日誌行為
一致。不同的是傳輸層無法承載的部分：

| 領域 | 在 HTTP/3 上 |
| --- | --- |
| 宣告的請求 trailer | 不轉發：回應提交前 `501`，提交後重設串流。 |
| 上游回應 trailer | `502`。 |
| `CONNECT` 與擴充 `CONNECT` | 隧道實作之前回 `501`。 |
| `php_fastcgi` | `501`；FastCGI 只在 HTTP/1.1 與 HTTP/2 上提供。 |

前面有 CDN 時，終結 HTTP/3 的是 CDN，它用 HTTP/1.1 或 HTTP/2 與源站通訊，所以這裡
的監聽無法證明訪客瀏覽器用了什麼；那要看 CDN 側的 HTTP/3 設定。

## ⚠️ 出問題時

- **`option --http3: the installed libcurl version doesn't support this`。**
  用戶端沒有 HTTP/3；用上面的容器。
- **`curl --http3` 卡住或逾時。** 某處擋住了 UDP 443。先查服務商防火牆或安全群組，
  再查主機。
- **主機上沒有 UDP 監聽。** 協定列表裡少了 `h3`，或者正在執行的不是你編輯的那個
  檔案（[重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)）。
- **本機能用、外面不能用。** 用戶端網路阻斷了 UDP 443，這在企業與飯店網路很常見；
  瀏覽器會靜默後退。
- **FastCGI 路由回 `501`。** 在 HTTP/3 上這是設計如此；[專案狀態](/zh-TW/project/status/)
  列出了什麼在哪種協定上提供。

## 🧭 下一步

- [TLS 能調什麼](/zh-TW/guides/tls-tuning/)：協定列表、憑證與用戶端憑證。
- [專案狀態](/zh-TW/project/status/)：本版本支援什麼、拒絕什麼、已知什麼缺陷。
- [`tls`](/zh-TW/reference/directives/#tls)：`http3` 選項的脈絡。
