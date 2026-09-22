---
title: 以服務方式執行
h1_emoji: '🔁'
sidebar:
  order: 4
description: 安裝出來的 systemd unit 到底做了什麼、如何啟動停止與重載、日誌去哪裡，以及設定出錯時從外面看是什麼樣子。
---

安裝程式留下一個已啟用、正在執行的 `systemd` unit。本頁逐條讀這個 unit，示範
如何操作它，並說明兩種故障從外面看是什麼樣子：起不來的服務，以及執行中的伺服器
拒絕新設定。

## 🧾 這個 unit 做了什麼

```bash
systemctl cat pingclair
```

真正重要的鍵是這些：

```text
[Service]
Type=notify
NotifyAccess=main
User=pingclair
Group=pingclair
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment="RUST_LOG=info"
Environment="PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs"
ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -HUP $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=always
RestartSec=5s
LimitNOFILE=1048576
```

依序讀：

- `Type=notify` 與 `NotifyAccess=main`：伺服器在監聽器綁定完成時通知
  `systemd`，所以 `systemctl start` 等到的是代理真的能應答，而不是行程存在。
- `User=pingclair` 加上 `AmbientCapabilities=CAP_NET_BIND_SERVICE`：服務以
  非特權使用者執行，同時仍能綁定 80 與 443。
- `PINGCLAIR_TLS_STORE`：憑證放在 `/var/lib/pingclair/certs`。服務帳號沒有家
  目錄，交給二進位預設值會把儲存區指到不存在的 `$HOME`。
- `ExecStartPre` 每次啟動前都會跑 `validate`。編譯不過的設定永遠到不了伺服器。
- `ExecReload` 送出 `SIGHUP`：重載讀取同一個檔案，不重啟行程。
- `Restart=always` 搭配 `RestartSec=5s`：啟動失敗每五秒重試一次。這是最容易
  讓人意外的一項，故障現象寫在下面。

⚠️ `curl | bash` 這種安裝方式寫的是精簡版 unit。倉庫裡的
`scripts/pingclair.service` 額外加了強化項（`ProtectSystem=full`、`PrivateTmp`、
`NoNewPrivileges`、`LimitNPROC`），並用了不同的重啟策略
（`Restart=on-failure` 搭配 `RestartPreventExitStatus=1`）。要換成更嚴格的
unit：

```bash
git clone https://github.com/dorianverlaine/pingclair
sudo cp pingclair/scripts/pingclair.service /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo systemctl restart pingclair
```

## 🎛️ 操作服務

`pc service` 就是這個 unit 的 `systemctl` 包裝，兩者可以互換：

| 目的 | 用 `pc` | 用 `systemctl` |
| --- | --- | --- |
| 啟動 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 重啟 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 重載設定 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 查看狀態 | `pc service status` | `systemctl status pingclair` |
| 追蹤日誌 | — | `journalctl -u pingclair -f` |

`pc service status` 顯示的就是 unit 自己的視角，包括伺服器上報的就緒行：

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
    Process: 1805 ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile (code=exited, status=0/SUCCESS)
   Main PID: 1808 (pingclair)
     Status: "Serving"
```

## 🔁 重載意味著什麼

讓改過的設定生效有兩條路，它們在檔案寫壞時表現不同。

`pc service reload` 送的是 `SIGHUP`，只要訊號送達就回報成功：

```text
✅ Service reloaded successfully
```

`pingclair reload` 走 Admin API，需要在全域選項區塊裡寫 `admin`。它會回報伺服器
對檔案的判斷：

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

兩種情況下，編譯不過的設定都會讓舊設定繼續執行，所以站台照常應答：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/
```

```text
200
```

所以一定要先驗證，把重載當成形式：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
```

例外是與整個行程有關的策略。像 `trusted_proxies` 這樣在啟動時確立的選項，只有
重啟後才生效：`sudo pc service restart`。

## 📜 日誌

unit 設定 `RUST_LOG=info`，把所有內容送進 journal：

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

啟動、重載、憑證工作，以及每個請求一行存取日誌都會出現在那裡：

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair_proxy::server: ♻️ Configuration reloaded successfully
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

想要獨立的、有輪替的日誌，就設定 `log` sink，寫到安裝程式建立並交給服務使用者的
`/var/log/pingclair` 底下。

## ⚠️ 服務起不來時

- **`is-active` 一直顯示 `activating`，`NRestarts` 不斷上升。** 這是安裝出來的
  重啟策略在作用：`Restart=always` 每五秒重試，所以壞設定看起來不是一個
  「失敗一次」的 unit，而是「永遠不收斂」的 unit。除錯前先停掉迴圈：
  `sudo systemctl stop pingclair`，改好檔案，然後
  `sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。** `ExecStartPre` 拒絕了設定，編譯器的原因在 journal 裡，例如
  `Error: ❌ Configuration Error: Compile error: Unsupported feature: 'encode br': Brotli is not implemented for proxied responses; use 'encode zstd gzip'`。
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`。**
  儲存區屬於服務帳號。用 `sudo ls -ld /var/lib/pingclair/certs` 確認擁有者是
  `pingclair`。
- **`systemd-analyze verify` 對已安裝的 unit 回報 `Missing '=', ignoring line`。**
  一鍵安裝寫的精簡版裡混進了 shell 替換產生的多餘行，`systemd` 會忽略它們。
  換成倉庫裡的 `scripts/pingclair.service` 就沒有了。
- **unit 在跑但外面沒有任何應答。** 監聽器已綁定，請求沒到達。和
  [安裝](/zh-TW/start/install/) 一節一樣，先查服務商防火牆，再查主機自身規則。

## 🧭 下一步

- [升級與移除](/zh-TW/start/upgrade/)：重跑安裝程式會保留什麼，以及如何全部
  拆掉。
- [HTTPS](/zh-TW/start/https/)：憑證、儲存區位置，以及為什麼 `pingclair trust`
  需要 `PINGCLAIR_TLS_STORE`。
- [`log`](/zh-TW/reference/directives/#log)：本頁從 journal 裡讀到的存取日誌
  輸出目標。
