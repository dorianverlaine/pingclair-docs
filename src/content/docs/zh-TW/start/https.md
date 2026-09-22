---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: 為公開網域取得憑證、發佈內部憑證，或帶自己的憑證進來，並驗證伺服器實際在提供什麼。
---

只要站台區塊的位址是公開網域，不需要 `tls` 指令就有了 HTTPS：Pingclair 透過
ACME 向 Let's Encrypt 申請憑證，在 80 連接埠回應 HTTP-01 挑戰，保存結果，並在
背景下續期。其餘三種取得憑證的方式 —— DNS-01、本機憑證授權單位、自己提供的
檔案 —— 下面分別說明各自需要什麼，以及在 v0.2.0-rc.3 裡實際是什麼行為。

## 🧾 開始之前

- 一個解析到這台主機的名字。先確認它，再懷疑伺服器：
  `dig +short A example.com`。
- 80 與 443 連接埠能從公網連上。HTTP-01 挑戰在 80 連接埠回應，憑證在 443 上
  使用。
- 一個用於 ACME 帳號的信箱位址。必須是真實信箱：Let's Encrypt 拒絕保留的
  example 網域，簽發會以 `contact email has forbidden domain "example.com"` 失敗。

下面的設定會取代服務執行的 `/etc/Pingclair/Pingclairfile`。重載前先驗證，這個
流程見[快速開始](/zh-TW/start/quickstart/)，重載語意見
[以服務方式執行](/zh-TW/start/service/)。

## 🌐 來自 Let's Encrypt 的憑證

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

沒有別的要設定。啟動時伺服器登記該主機名、啟動 ACME 流程並回應挑戰：

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

存取日誌裡那條挑戰請求來自憑證授權單位，不是瀏覽器：

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

從另一台機器驗證實際提供的內容：

```bash
curl -I https://example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
etag: "493b-6ab1f452"
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

```text
subject=CN=example.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 22 02:35:03 2026 GMT
notAfter=Dec 21 02:35:02 2026 GMT
```

憑證實體保存在服務帳號的資料目錄，
`/var/lib/pingclair/.local/share/pingclair`——二進位從該帳號的 home 解析出來的
路徑，也是以別的執行者身分執行指令時 `PINGCLAIR_TLS_STORE` 指定的那一個。

## 📡 DNS-01 與萬用字元

DNS-01 用發佈 TXT 記錄來證明對網域的控制，而不是在 80 連接埠回應，萬用字元憑證
必須走這條路。設定裡需要服務商區塊：

```caddyfile
{
    email bonjour@pingclair.com
}

*.example.com {
    tls {
        auto
        dns cloudflare <token>
        resolvers 1.1.1.1
        propagation_delay 10s
    }
    file_server /var/lib/pingclair/html
}
```

有兩個容易漏掉的細節。區塊裡的 `auto` 行才會把網域放進簽發名單；不寫它，伺服器
會記錄 `authorised for 0 hostname(s)`，完全不申請憑證，所有握手都以
`NO_CERTIFICATE_SET` 失敗。另外 token 是 Cloudflare API token，需要該網域所在
區域的 `Zone:DNS:Edit` 權限。

⚠️ **在 v0.2.0-rc.3 裡 DNS-01 簽發無法完成。** 挑戰本身是跑起來的：記錄發佈了，
按設定指定的解析器確認了傳播，也要求了憑證授權單位做驗證。隨後訂單在一秒內變成
invalid，試過的每個網域都是如此，憑證從未落盤：

```text
📡 Published the DNS-01 record for _acme-challenge.example.com via cloudflare
👍 DNS-01 record for _acme-challenge.example.com is visible
🚀 Verification triggered for example.com
⏳ Polling order status...
⚠️ Eager issuance failed for example.com: Order ended in state: Invalid
```

在修好之前，公開網域請用 HTTP-01。因此萬用字元網域暫時還不能帶憑證提供服務；
替代方案是每個名字單獨一張憑證，或者在別處簽發後以檔案形式提供。

## 🏛️ 來自內部憑證授權單位的憑證

對於私有源站 —— 隧道、內部主機名、實驗機器 —— Pingclair 可以自己當憑證授權
單位：

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

站台會提供由 `CN=Pingclair Local Authority` 簽發、有效期十年的憑證，根憑證
發佈在儲存區裡：

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

用戶端還不信任它，所以不帶 `-k` 的請求會失敗。把根憑證裝進系統信任儲存區：

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

`PINGCLAIR_TLS_STORE` 前綴很重要：`pingclair trust` 看的是執行它的使用者的儲存區
（root 就是 `/root/.local/share/pingclair`），而服務用的是
`/var/lib/pingclair/.local/share/pingclair`。不加前綴，指令會回答
`No internal CA root at /root/.local/share/pingclair/internal/root.crt`。

信任根憑證之後，同樣的請求不帶 `-k` 也會成功：

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` 用同樣的儲存區前綴把它移除。

## 📜 自己提供的憑證

當另一個系統簽發你的憑證時，讓 `tls` 指向那些檔案：

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

檔案必須能被 `pingclair` 使用者讀取，因為服務以該使用者執行。`validate` 會拒絕
不存在的路徑，而不是等到第一次握手才失敗：

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ HTTPS 起不來時

- **`contact email has forbidden domain "example.com"`。** Let's Encrypt 拒絕把
  保留的 example 網域當作帳號聯絡方式。請在 `email` 選項填真實信箱。
- **日誌裡的 `NO_CERTIFICATE_SET`。** 握手帶來了伺服器沒有憑證的網域。往上讀
  日誌：沒有 `auto` 的 `tls` 區塊不會啟動簽發，而 DNS-01 在這個版本裡無法
  完成。
- **挑戰從未被提供。** 80 連接埠被防火牆擋住，或者被別的東西占用。憑證授權單位
  必須能從公網存取 `http://your-name/.well-known/acme-challenge/`。
- **網域沒有解析到這台主機。** `dig +short A your-name` 顯示憑證授權單位會連到
  哪裡，最近改過解析之後，結果常常和想的不一樣。
- **反覆失敗。** Let's Encrypt 會對每個網域的失敗驗證限流。先修好原因再重試，
  否則重試本身就成了錯誤。

## 🧭 下一步

- [以服務方式執行](/zh-TW/start/service/)：unit、重載語意與日誌。
- [`tls`](/zh-TW/reference/directives/#tls)：該指令的全部模式與選項。
- [Pingclairfile](/zh-TW/reference/pingclairfile/)：位址、matcher，以及編譯器
  接受什麼。
