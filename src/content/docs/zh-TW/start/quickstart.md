---
title: 快速開始
h1_emoji: '🏃'
sidebar:
  order: 2
description: 撰寫第一份 Pingclairfile、驗證它，以前景或背景方式執行，並提供真實目錄。
---

本頁從一台裝好的主機走到你完全掌握的伺服器：磁碟上的設定、經過驗證的編譯、可以
啟動、停止與監看的服務行程，以及一個證明檔案伺服器確實回應了的驗證步驟。前提是
[安裝](/zh-TW/start/install/) 已經完成。

## 🧾 開始之前

安裝程式留下了一個跑在 80 連接埠上的服務，它握著 `/etc/Pingclair/Pingclairfile`
裡的設定。做實驗期間先把它停掉，騰出連接埠：

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

有三點值得點名。頂端的無名區塊是全域選項，`admin` 讓 `pingclair start`、
`stop`、`reload` 能跟正在執行的伺服器對話。站台位址帶 scheme，`http://` 強制
明文；不寫它的話，Pingclair 會把 `localhost` 當成名字，用自帶的憑證授權單位
提供 HTTPS，明文 HTTP 用戶端看到的只會是空回應（[HTTPS](/zh-TW/start/https/)）。
`file_server` 的根目錄相對於目前工作目錄。

## 2. ✅ 執行前先驗證

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` 預設讀取 `./Pingclairfile`，也能辨識 `./Caddyfile`。它編譯設定並
執行語意檢查，例如憑證路徑是否存在。驗證不是建議：未通過的設定不會執行，最後
一行會給出原因。

## 3. 🧭 看設定會變成什麼

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

編譯後的 JSON 就是伺服器真正執行的形式。當某個指令的行為與文件不符時，這裡是
第一個該看的地方。想反過來看 `pingclair fmt` 會改檔案裡的什麼：

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` 輸出正規形式，縮排是兩個空白。

## 4. 🚀 執行

前景執行，日誌留在終端機裡：

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

加上 `--watch`，每次儲存都會重新載入設定，這就是開發循環：

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

也可以放到背景，讓它不受 shell 影響：

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`、`stop`、`reload` 透過 Admin API 聯絡正在執行的伺服器，這就是
上面設定裡要寫 `admin` 的原因。`pingclair run` 不需要它。

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

`ETag` 與 `Last-Modified` 說明檔案伺服器從磁碟讀取了檔案，內容就是
`public/index.html`。要停掉背景伺服器：

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ 一行指令起服務

有三個子指令不需要設定檔就能提供服務，適合臨時試驗或一次性主機：

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

啟動時各自印出自己的監聽位址：

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

送到 `:8082` 的每個請求都會轉給 `:8081` 上的檔案伺服器，`:8083` 直接回傳你傳入
的內容。`respond` 只用於開發。

## 🔁 交給服務

服務執行的是 `/etc/Pingclair/Pingclairfile`，所以把設定放到那裡才能撐過重開機：

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
curl -i http://localhost/
```

`SIGUSR1` 才是重載訊號，不需要額外設定。`pingclair reload` 透過 Admin API 做
同一件事，還會回報伺服器對檔案的判斷，需要在全域選項區塊裡寫 `admin`。

兩條路都要先驗證。`pc service reload` 看起來是那條理所當然的指令，其實不是：
安裝出來的 unit 送出 `SIGHUP`，伺服器會忽略它，於是指令回報成功，而舊設定繼續
提供服務（[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。

## ⚠️ 出問題時

- **`Address already in use`。** 安裝程式的服務還占著 `:80`，或者別的行程占著
  你的連接埠。`sudo ss -ltnp | grep :80` 會顯示占用者，`sudo pc service stop`
  會釋放預設那個。
- **在 `http://localhost:8080` 上收到 `Empty reply from server`。** 你在用明文
  跟 TLS 監聽器說話。給站台位址加上 `http://`，或者信任內部憑證後用 `https://`
  存取。
- **`Cannot reach admin API at 127.0.0.1:2019`。** 設定裡沒有 `admin`，沒有
  對象接收 `pingclair stop` 與 `pingclair reload`。把它加進全域選項區塊，或者用
  Ctrl-C 停掉前景行程。
- **`curl` 在回送位址上卡住。** 系統代理攔截了請求。加上 `curl --noproxy '*'`
  重試。
- **驗證以 `Unsupported feature` 失敗。** 指令被辨識但沒有實作，訊息會給出
  替代方案，例如 `encode br`：代理回應沒有實作 Brotli，於是訊息指向
  `encode zstd gzip`。

## 🧭 下一步

- [HTTPS](/zh-TW/start/https/)：為公開網域簽發憑證，走 Let's Encrypt 或內部
  憑證授權單位。
- [以服務方式執行](/zh-TW/start/service/)：unit、重載語意與日誌。
- [Pingclairfile](/zh-TW/reference/pingclairfile/)：語言本身，包括 matcher、
  snippet 與 import。
