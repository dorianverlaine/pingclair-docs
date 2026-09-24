---
title: 'TLS：可以調整什麼'
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Pingclair 遵循哪些 TLS 與協定設定、指名拒絕哪些，以及如何要求用戶端憑證或在主機之間搬移憑證儲存區。
---

Pingclair 的 TLS 設定刻意很少：名稱會自動取得憑證，本頁的設定只決定取得的方式。Caddy 接受的其他 TLS 設定都會被指名拒絕，而不是被忽略，所以設定永遠不會悄悄做得比寫的少。下面每一項結果都是在真實主機上量測的。

📌 本頁描述的是最新公開的發行版 **v0.2.0-rc.3**。只存在於伺服器 `main` 分支上的變動，以 **下一版** 標示。

## 🧾 開始之前

- 已安裝並執行 Pingclair（[安裝](/zh-TW/start/install/)）。
- 關於憑證授權單位的部分，需要一個解析到這台主機的名稱，或在實驗機上使用內部憑證授權單位（[HTTPS](/zh-TW/start/https/)）。

## 🌐 提供哪些協定

協定集合寫在全域的 `servers` 區塊中：

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

以 `sudo ss -lun | grep ':443 '` 實測：

| 設定 | UDP 443 監聽器 |
| --- | --- |
| `protocols h1 h2` | 0 — 沒有 HTTP/3 |
| `protocols h1 h2 h3` | 1 — 已啟用 HTTP/3 |

⚠️ 這份清單決定的是 **HTTP/3**，而且只決定 HTTP/3。只列 `h1` 並不會關閉 HTTP/2：設定 `protocols h1` 時，提出 `h2` 的用戶端仍然協商出了 HTTP/2。伺服器從清單中讀取的唯一資訊是 `h3` 在不在裡面，所以沒有任何設定能停用 HTTP/2。沒有 `protocols` 這一行時，HTTP/3 是開啟的。

在個別網站上，`http3 off` 的用意是把一個名稱排除在 HTTP/3 之外，同時讓 QUIC 監聽器繼續為其他名稱提供服務：

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

⚠️ 在 v0.2.0-rc.3 中，這個選項會被接受，但沒有任何效果。**下一版**：它會生效，而且該網站不再於 `Alt-Svc` 中宣告 HTTP/3。

## 🏛️ 憑證來源

三種來源，都在 [HTTPS 頁面](/zh-TW/start/https/)上示範過：

| 來源 | 設定 | 用途 |
| --- | --- | --- |
| Let's Encrypt | 單純的公開名稱 | 公開名稱，在背景自動續期。 |
| 內部憑證授權單位 | `tls internal` | 實驗用名稱、私有源站、tunnel。 |
| 你自己的檔案 | `tls { cert … key … }` | 在其他地方簽發的憑證。 |

續期在背景執行。全域選項 `renewal_window_ratio` 以每張憑證有效期的比例，設定續期要提早多久開始。

## 🔐 用戶端憑證

`client_auth` 會讓伺服器向用戶端要求憑證。先用 `openssl` 建立一個小型憑證授權單位與一張用戶端憑證，再把網站指向該憑證授權單位的憑證**檔案**：

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

實測：沒有用戶端憑證的請求會在交握時失敗，同一個請求加上 `--cert client.crt --key client.key` 則回應 `200`。

模式有 `request`、`require`、`verify_if_given` 與 `require_and_verify`。拼錯的模式會被拒絕，並附上完整清單 `(expected request, require, verify_if_given or require_and_verify)`。

⚠️ `trusted_ca_cert` 接受的是憑證本身，以 base64 編碼寫成一行；`trusted_ca_cert_file` 接受的則是路徑。把路徑傳給前者可以通過編譯，但會在啟動時以 `trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` 失敗——45 就是 `-----BEGIN` 裡的 `-`。這個檔案也必須讓 `pingclair` 使用者讀得到。

## 📦 搬移憑證儲存區

儲存區存放已簽發的憑證、ACME 帳號，以及內部憑證授權單位。以套件安裝時，它位於 `/var/lib/pingclair/.local/share/pingclair`，也就是服務帳號家目錄底下的資料目錄。以其他使用者身分執行的命令，會去找該使用者自己的資料目錄，所以範例都設定了 `PINGCLAIR_TLS_STORE`；少了它，root 會使用 `/root/.local/share/pingclair`。`storage-export` 與 `storage-import` 負責搬移儲存區：

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/.local/share/pingclair
sudo mkdir -p /var/lib/pingclair/.local/share/pingclair && sudo chown pingclair:pingclair /var/lib/pingclair/.local/share/pingclair
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/.local/share/pingclair
```

這次執行中有三個細節。不論檔名是什麼，封存檔都是**單純的 tar**，以 `600` 權限寫入，所以要讀回來需要 root。匯入會還原封存檔中記錄的擁有者。此外，儲存區裡還有 `autosave.json`，也就是 Admin API 最後套用的設定，所以匯入也會把它還原。

**下一版**：內部憑證授權單位會照 Caddy 的方式存放在 `pki/authorities/local/` 底下。舊的 `internal/` 目錄不會被遷移：伺服器會建立新的憑證授權單位，每個用戶端都必須再次信任新的根憑證（`pingclair trust`）。全域的 `storage file_system <path>` 選項也能在設定中指定儲存區的位置。

如果之後服務以 `Internal CA I/O error: Permission denied` 拒絕啟動，代表服務帳號無法寫入儲存區的檔案；執行 `sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair` 即可修正，網站也會恢復回應。

## 🚫 無法調整的部分

Pingclair 認得下列 Caddy 設定並會拒絕它們，所以檔案絕不會在其中一項被悄悄丟掉的情況下執行：

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

因此，加密套件、曲線、ALPN 清單與隨需簽發都由建置決定，而不是由設定決定。伺服器也不做 OCSP stapling。如果其中哪一項對你很重要，那是功能請求，而不是設定錯誤。

## ⚠️ 無法運作時

- **`client_auth` 以 `not valid base64` 拒絕啟動。**你把路徑傳給了 `trusted_ca_cert`；檔案的寫法是 `trusted_ca_cert_file`。
- **持有有效憑證的用戶端被拒絕。**請確認簽發它的 CA 就是 `trusted_ca_cert_file` 裡的那一個，而且憑證沒有過期。
- **`tls ciphers`／`tls curves`／`tls alpn`／`tls on_demand` 讓檔案被拒絕。**它們沒有實作；請見上一節。
- **設定 `protocols h1 h2` 後 HTTP/3 仍在執行。**這不應該發生，因為那份清單控制的就是它。如果 UDP 443 仍在監聽，代表正在執行的檔案不是你編輯的那一份（[重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)）。
- **搬移儲存區後服務無法啟動。**是擁有者的問題，如上所述。

## 🧭 下一步

- [HTTPS](/zh-TW/start/https/)：取得憑證的四種方式，以及它們確切的日誌內容。
- [HTTP/3](/zh-TW/guides/http3/)：開啟它，並證明用戶端真的用了它。
- [`tls`](/zh-TW/reference/directives/#tls)：指令參考。
