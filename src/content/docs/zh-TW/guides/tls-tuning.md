---
title: TLS 能調什麼
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair 尊重哪些 TLS 與協定設定、按名字拒絕哪些、如何要求用戶端憑證，以及在主機之間搬移憑證儲存區。
---

Pingclair 的 TLS 面刻意做得很小：網域自動拿到憑證，決定這件事怎麼發生的設定就是
本頁記錄的這些。Caddy 接受的其他寫法不會被靜默忽略，而是按名字拒絕，所以設定
永遠不會比它寫著的做得更少。本頁把真機上量出來的「確實生效」與「確實不生效」
放在一起。

## 🧾 開始之前

- 已經安裝並執行 Pingclair（[安裝](/zh-TW/start/install/)）。
- 涉及憑證授權單位的部分需要一個解析到本機的網域，實驗機則用內部單位
  （[HTTPS](/zh-TW/start/https/)）。

## 🌐 提供哪些協定

協定集合放在全域 `servers` 區塊裡：

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

用 `sudo ss -lun | grep ':443 '` 實測：

| 設定 | UDP 443 監聽 |
| --- | --- |
| `protocols h1 h2` | 0 —— 沒有 HTTP/3 |
| `protocols h1 h2 h3` | 1 —— 啟用 HTTP/3 |

⚠️ 這個列表決定的是 **HTTP/3**，僅此而已。只寫 `h1` 並不會拿走 HTTP/2：在
`protocols h1` 下，一個在 ALPN 裡提供 `h2` 的用戶端仍然協商到 HTTP/2。編譯器
只是把這個列表對應到 HTTP/3 開關上（`config.global.http3 = protocols.contains(H3)`），
沒有依網域關閉 HTTP/2 的設定。

依站台看，`http3 off` 會把該網域移出 HTTP/3，而不停止 QUIC 監聽器：

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

## 🏛️ 憑證來源

三種來源，[HTTPS 頁](/zh-TW/start/https/) 都示範過：

| 來源 | 設定 | 用途 |
| --- | --- | --- |
| Let's Encrypt | 裸的公開網域 | 公開網域，背景續期。 |
| 內部單位 | `tls internal` | 實驗網域、私有源站、隧道。 |
| 自己的檔案 | `tls { cert … key … }` | 在別處簽發的憑證。 |

續期自行執行；全域選項裡的 `renewal_window_ratio` 用每張憑證壽命的比例決定提前
多久開始。

## 🔐 用戶端憑證

`client_auth` 要求用戶端出示憑證。用 `openssl` 產生一個小型單位與用戶端憑證，
然後讓站台指向單位的**檔案**：

```caddyfile
https://internal.test {
    tls {
        internal
        client_auth {
            mode require_and_verify
            trusted_ca_cert_file /etc/pingclair/client-ca.crt
        }
    }
    file_server /srv/site
}
```

實測：不帶用戶端憑證的請求在握手階段失敗；帶上
`--cert client.crt --key client.key` 的同一個請求回 `200`。

模式有 `request`、`require`、`verify_if_given`、`require_and_verify`，沒有後備：
拼錯會被連同完整列表
`(expected request, require, verify_if_given or require_and_verify)` 一起拒絕。

⚠️ `trusted_ca_cert` 收的是**內聯**憑證，`trusted_ca_cert_file` 收的是路徑。把路徑
給前者能編譯，但啟動時會以
`trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` 失敗
（`-----BEGIN` 裡的那個 `-`）。檔案還必須能被 `pingclair` 使用者讀取。

## 📦 搬移憑證儲存區

`PINGCLAIR_TLS_STORE` 指定的儲存區（安裝出來的 unit 裡是
`/var/lib/pingclair/certs`）保存著已簽發的憑證、ACME 帳號與內部單位。
`storage-export` 與 `storage-import` 負責搬運：

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/certs
sudo mkdir -p /var/lib/pingclair/certs && sudo chown pingclair:pingclair /var/lib/pingclair/certs
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/certs
```

執行中發現的三個細節。封存不管叫什麼名字都是**純 tar**，而且以 `600` 權限寫出，
所以讀回來需要 root。匯入會還原封存裡記錄的擁有者。儲存區裡還有 `autosave.json`
（Admin API 最後套用的設定），匯入會把它一併帶回來。

如果之後服務以 `Internal CA I/O error: Permission denied` 拒絕啟動，說明儲存區裡
的檔案對服務帳號不可寫；`sudo chown -R pingclair:pingclair /var/lib/pingclair/certs`
能修好，站台隨即恢復應答。

## 🚫 調不了的東西

以下是 Pingclair 認識並拒絕的 Caddy 設定，設定不會帶著被靜默丟棄的設定繼續執行：

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

實務上這意味著：密碼套件、曲線、ALPN 列表、隨需簽發都是建置的選擇而不是設定的
選擇；OCSP stapling 與 `preferred_chains` 也沒有實作。如果其中某一項對你重要，
那是功能請求，不是設定錯誤。

## ⚠️ 出問題時

- **`client_auth` 以 `not valid base64` 拒絕啟動。** 你給 `trusted_ca_cert` 傳了
  路徑；檔案形式的寫法是 `trusted_ca_cert_file`。
- **持有有效憑證的用戶端被拒絕。** 檢查簽發它的單位是否就是
  `trusted_ca_cert_file` 裡的那個，以及憑證是否過期。
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand` 拒絕該檔案。**
  它們沒有實作；見上一節。
- **`protocols h1 h2` 之後 HTTP/3 還在跑。** 不該如此 —— 控制它的就是那個列表。
  如果 UDP 443 還在監聽，說明正在執行的不是你編輯的那個檔案，見
  [重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)。
- **搬移儲存區後服務起不來。** 就是上面的擁有者問題。

## 🧭 下一步

- [HTTPS](/zh-TW/start/https/)：拿到憑證的四種方式，以及它們確切的日誌行。
- [HTTP/3](/zh-TW/guides/http3/)：開啟它，並證明用戶端真的用了它。
- [`tls`](/zh-TW/reference/directives/#tls)：指令參考。
