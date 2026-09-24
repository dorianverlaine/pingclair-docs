---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: 為公開網域名稱取得憑證、發布內部憑證，或使用你自己的憑證，並確認伺服器實際提供的是什麼。
---

位址是公開網域名稱的網站區塊，不寫 `tls` 指令也會有 HTTPS：Pingclair 會透過 ACME 向 Let's Encrypt 申請憑證，在 80 連接埠回應 HTTP-01 驗證，把結果存起來，並在背景自動續期。另外三種取得憑證的方式——DNS-01、本機憑證授權單位，以及你自己提供的檔案——在下面分別說明，連同各自的前提條件。

## 🧾 開始之前

- 一個解析到這台主機的網域名稱。怪罪伺服器之前先檢查一下：`dig +short A example.com`。
- 80 與 443 連接埠能從網際網路連到。HTTP-01 驗證在 80 連接埠上提供，憑證則用在 443。
- ACME 帳號用的 email 地址。它必須是真實的信箱：Let's Encrypt 會拒絕保留的範例網域，簽發會以 `contact email has forbidden domain "example.com"` 失敗。

下面的設定會取代服務執行的 `/etc/Pingclair/Pingclairfile`。重載前請先驗證；[快速開始](/zh-TW/start/quickstart/)示範了這個流程，[以服務方式執行](/zh-TW/start/service/)則說明重載。

## 🌐 來自 Let's Encrypt 的憑證

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

不需要其他設定。啟動時，伺服器會授權這個主機名稱、啟動 ACME 流程，並提供驗證回應：

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

存取日誌中的驗證請求來自憑證授權單位，而不是瀏覽器：

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

從另一台機器確認實際提供的內容：

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

憑證資料保存在服務使用者的資料目錄 `/var/lib/pingclair/.local/share/pingclair`——這是二進位檔從該帳號的家目錄推算出的路徑，也是以其他使用者身分執行命令時，`PINGCLAIR_TLS_STORE` 要指定的路徑。

## 📡 DNS-01 與萬用字元憑證

DNS-01 以發布一筆 TXT 記錄來證明你掌控某個名稱，而不是在 80 連接埠上回應。萬用字元憑證必須用它，80 連接埠關閉的主機也一樣。

⚠️ **DNS-01 在 v0.2.0-rc.3 中無法完成。**該版本在 TXT 記錄裡發布了錯誤的值，所以每一張訂單最後都是 `Invalid`。修正以及下面說明的單一萬用字元憑證都在 `main` 上，尚未發行。若現在就要使用 DNS-01，請用安裝程式的 `--main` 旗標安裝 `main`（[安裝](/zh-TW/start/install/#-從發行版二進位檔安裝)）。本節的輸出顯示的是該建置的行為。

設定需要 provider 區塊：

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

有兩個細節容易漏掉。第一，區塊裡的 `auto` 這一行才會把名稱放進簽發清單；少了它，伺服器會記錄 `authorised for 0
hostname(s)`，永遠不會申請憑證，每次交握都會以 `NO_CERTIFICATE_SET` 失敗。第二，token 是 Cloudflare API token，必須對存放該名稱的 zone 具有 `Zone:DNS:Edit` 權限。

🃏 **一張葉憑證涵蓋整個網站。**`*.example.com` 網站申請的就是 `*.example.com` 本身：一張在啟動時取得的憑證，提供給它底下的每一個名稱。萬用字元只涵蓋恰好一層標籤，所以頂層網域需要自己的項目——如果網站也要回應 `example.com`，請寫成 `*.example.com, example.com`，每個主體都會照書寫的樣子申請。以這種方式提供的子網域不會出現在 Certificate Transparency 日誌中，這本來就是使用萬用字元的隱私理由。

網站底下的任何名稱都由這一張葉憑證提供。從另一台機器：

```bash
curl -I https://anything.example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername anything.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName
```

```text
subject=CN=*.example.com
issuer=C=US, O=Let's Encrypt, CN=YE1
X509v3 Subject Alternative Name:
    DNS:*.example.com
```

## 🏛️ 來自內部憑證授權單位的憑證

對於私有的源站——tunnel、內部主機名稱、實驗用的機器——Pingclair 可以自己當憑證授權單位：

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

網站會以 `CN=Pingclair Local Authority` 簽發、效期十年的憑證回應，根憑證則發布在儲存區中：

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

用戶端目前還不信任它，所以不加 `-k` 的請求會失敗。把根憑證安裝到系統的信任儲存區：

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

`PINGCLAIR_TLS_STORE` 前綴很重要：`pingclair trust` 會去找執行它的使用者的儲存區，對 root 而言是 `/root/.local/share/pingclair`，但服務用的是 `/var/lib/pingclair/.local/share/pingclair`。少了這個前綴，它會回答 `No
internal CA root at /root/.local/share/pingclair/internal/root.crt`。

信任根憑證之後，同一個請求不加 `-k` 也會成功：

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` 可以再把它移除，同樣要加上儲存區前綴。

📌 **下一版**。下一版會照 Caddy 的方式存放內部憑證授權單位：放在儲存區的 `pki/authorities/local/` 底下，並由一張中繼憑證簽發葉憑證。舊的 `internal/` 目錄不會被遷移：升級後伺服器會建立新的根憑證，每個用戶端都必須再用 `pingclair trust` 信任一次。

## 📜 你自己提供的憑證

當憑證由其他系統簽發時，把 `tls` 指向那些檔案：

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

這些檔案必須讓 `pingclair` 使用者讀得到，因為服務是以該使用者身分執行的。`validate` 會直接拒絕不存在的路徑，而不是等到第一次交握才失敗：

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ HTTPS 起不來時

- **`contact email has forbidden domain "example.com"`。**Let's Encrypt 不接受保留的範例網域作為帳號聯絡人。請在 `email` 選項裡填入真實的信箱。
- **日誌中出現 `NO_CERTIFICATE_SET`。**交握時提出的名稱，伺服器沒有對應的憑證。請看它上方的日誌：沒有 `auto` 的 `tls` 區塊永遠不會開始簽發，而 DNS-01 在這個發行版裡無法完成。
- **驗證回應從未被提供。**80 連接埠被防火牆擋住，或被其他程式佔用。憑證授權單位必須能從網際網路連到 `http://your-name/.well-known/acme-challenge/`。
- **名稱沒有解析到這台主機。**`dig +short A your-name` 會顯示憑證授權單位將連到哪裡，剛改過設定時，結果不一定是你預期的。
- **反覆失敗。**Let's Encrypt 會依主機名稱限制驗證失敗的次數。重試前先修好原因，否則重試本身就會變成錯誤。

## 🧭 下一步

- [以服務方式執行](/zh-TW/start/service/)：unit、它的重載語意，以及它的日誌。
- [`tls`](/zh-TW/reference/directives/#tls)：這個指令的每種模式與選項。
- [Pingclairfile](/zh-TW/reference/pingclairfile/)：位址、匹配器，以及編譯器接受什麼。
