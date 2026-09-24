---
title: 快速開始
h1_emoji: '🏃'
sidebar:
  order: 2
description: 寫出第一份 Pingclairfile、驗證它、在前景或背景執行，並提供一個真實的目錄。
---

本頁從一台裝好 Pingclair 的主機出發，帶你得到一個由你掌控、正在執行的伺服器：磁碟上的一份設定、一次通過驗證的編譯、一個能啟動、停止與觀察的伺服器，以及一個證明檔案伺服器確實有回應的驗證步驟。前提是你已經完成[安裝](/zh-TW/start/install/)。

## 🧾 開始之前

安裝程式留下了一個在 80 連接埠上執行的服務，它使用的是 `/etc/Pingclair/Pingclairfile` 裡的設定。實驗期間先把它停掉，讓連接埠空出來：

```bash
sudo pc service stop
```

```bash
mkdir -p ~/demo/public
cd ~/demo
echo '<h1>hello from ~/demo/public</h1>' > public/index.html
```

## 1. ✍️ 撰寫設定

建立 `~/demo/Pingclairfile`：

```caddyfile
{
    admin 127.0.0.1:2019
}

http://localhost:8080 {
    file_server ./public
}
```

有三個細節很重要：

- 最上方沒有名稱的區塊放的是全域選項。`admin` 會開啟 Admin API，`pingclair start`、`stop` 與 `reload` 都透過它連到執行中的伺服器。
- 網站位址中的 `http://` scheme 會強制使用明文。少了它，Pingclair 會把 `localhost` 當成一個名稱，用自家憑證授權單位簽發的憑證提供 HTTPS，而一般的 HTTP 用戶端只會收到空回應（[HTTPS](/zh-TW/start/https/)）。
- `file_server` 的根目錄是相對於工作目錄的。

## 2. ✅ 執行前先驗證

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` 預設讀取 `./Pingclairfile`，也會偵測 `./Caddyfile`。它會編譯設定並執行語意檢查，例如憑證路徑是否存在。驗證不是參考意見：沒通過的設定就不會執行，失敗時最後一行會印出原因。

## 3. 🧭 看看設定會變成什麼

```bash
pingclair adapt --pretty
```

```text
{
  "debug": false,
  "servers": [
    {
      "name": "localhost",
      "names": [
        "localhost"
      ],
      "listen": [
        "[::]:8080"
      ],
```

編譯後的 JSON 就是伺服器實際執行的形式。當某個指令的行為與文件不符時，這是第一個該看的地方。若想看 `pingclair fmt` 會怎麼改這個檔案：

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` 會印出標準格式，以兩個空白縮排。

## 4. 🚀 執行

在前景執行，日誌會一直顯示在你的終端機上：

```bash
pingclair run Pingclairfile
```

```text
🚀 Starting Pingclair with config: Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: Pingclairfile
🔧 Configured 1 server(s)
🔐 Auto HTTPS: enabled
```

加上 `--watch`，每次存檔都會重新載入設定，這就是開發時的工作循環：

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

或者在背景執行，關掉 shell 之後它仍會繼續運作：

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`、`stop` 與 `reload` 透過 Admin API 連到執行中的伺服器，這就是上面的設定要寫 `admin` 的原因。`pingclair run` 則不需要它。

## 5. 🔍 驗證

```bash
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 34
Last-Modified: Tue, 22 Sep 2026 03:26:39 GMT
ETag: "22-6ab1f56f"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag` 與 `Last-Modified` 代表檔案伺服器確實從磁碟讀取了檔案，本文就是 `public/index.html`。要停止背景執行的伺服器：

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ 一行命令就能起的伺服器

有三個子命令不需要設定檔就能提供服務，適合用來快速試東西，或用在用完即丟的主機上：

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

每個命令啟動時都會印出它的監聽位址：

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

送到 `:8082` 的每個請求都會代理到 `:8081` 上的檔案伺服器，`:8083` 則以你傳入的本文回應。`respond` 僅供開發使用。

## 🔁 移進服務裡

服務執行的是 `/etc/Pingclair/Pingclairfile`，所以把你的設定放到那裡，它才能在重新開機後繼續存在：

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

`pc service reload` 會請執行中的伺服器重新讀取檔案，unit 的做法是送出 `SIGUSR1`。`pingclair reload` 透過 Admin API 走到同一段程式碼，還會回報伺服器對這個檔案的判定，因此需要全域選項區塊裡的 `admin`；`sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` 則兩者都不需要。

不論用哪一種，都請先驗證，事後再讀結果：`systemctl reload` 只會回報訊號已送達，伺服器的判定——已套用，或附理由拒絕——會出現在 unit 的狀態列與 journal 中。被拒絕的重載會讓先前的設定繼續提供服務，這正是拒絕的用意。完整說明請見[以服務方式執行](/zh-TW/start/service/#-重載意味著什麼)。

## ⚠️ 無法運作時

- **`Address already in use`。**安裝程式的服務仍佔著 `:80`，或有其他行程佔用了你的連接埠。`sudo ss -ltnp | grep :80` 會列出佔用者；`sudo pc service stop` 可以釋放預設的那個。
- **對 `http://localhost:8080` 出現 `Empty reply from server`。**你正在用明文跟 TLS 監聽器說話。請在網站位址加上 `http://` scheme，或改用 `https://` 連線並信任內部憑證。
- **`Cannot reach admin API at 127.0.0.1:2019`。**設定裡沒有 `admin` 選項，所以沒有東西在等 `pingclair stop` 與 `pingclair reload`。請把它加進全域選項區塊，或在前景行程按 Ctrl-C 停止。
- **`curl` 連 loopback 位址時卡住。**有系統代理攔截了請求。請改用 `curl --noproxy '*'` 再試一次。
- **驗證失敗並顯示 `Unsupported feature`。**這個指令認得但沒有實作，訊息會指出替代方案，例如 `encode br`：代理的回應沒有實作 Brotli，所以訊息會指向 `encode zstd gzip`。

## 🧭 下一步

- [HTTPS](/zh-TW/start/https/)：從 Let's Encrypt 或內部憑證授權單位，為公開網域名稱取得憑證。
- [以服務方式執行](/zh-TW/start/service/)：unit、它的重載語意，以及它的日誌。
- [Pingclairfile](/zh-TW/reference/pingclairfile/)：語言本身，包括匹配器、片段與匯入。
