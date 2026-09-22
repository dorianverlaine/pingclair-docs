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
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -USR1 $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=on-failure
RestartPreventExitStatus=1
RestartSec=5s
LimitNOFILE=1048576
LimitNPROC=512
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true
```

依序讀：

- `Type=notify` 與 `NotifyAccess=main`：伺服器在監聽器綁定完成時通知
  `systemd`，所以 `systemctl start` 等到的是代理真的能應答，而不是行程存在。
- `User=pingclair` 加上 `AmbientCapabilities=CAP_NET_BIND_SERVICE`：服務以
  非特權使用者執行，同時仍能綁定 80 與 443。
- `PINGCLAIR_TLS_STORE`：憑證放在 `/var/lib/pingclair/certs`。服務帳號沒有家
  目錄，交給二進位預設值會把儲存區指到不存在的 `$HOME`。
- 這裡刻意不寫 `ExecStartPre` 去跑 `validate`。那看起來是放檢查的安全位置，恰恰
  也是陷阱：`systemd` 的 `RestartPreventExitStatus=` 作用於主行程，不作用於失敗
  的前置指令，所以編譯器拒絕的設定會每五秒被重試一次，而不是讓 unit 停在
  failed。伺服器自己在綁定任何東西之前編譯檔案，拒絕時以結束碼 1 結束——這正是
  上面的重啟策略為之而寫的結束碼，`pingclair run` 的存在就是為了成為那個行程。
- `ExecReload` 送出 `SIGUSR1`，也就是伺服器理解為「重新讀檔案」的訊號。
  `SIGHUP` 被刻意忽略，而過去送出它的 unit 會在舊設定繼續服務的同時回報成功
  （[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。
  `systemd` 只能觀察到 `kill` 結束了，所以伺服器把對檔案的判斷發佈到 unit 的
  status line 上——`Serving (reloaded 1 listener(s) in 323.341µs)`，或者
  `Reload rejected: …`——`systemctl status` 會顯示它。下面的
  [重載意味著什麼](#-重載意味著什麼) 是詳細版本。
- `Restart=on-failure` 搭配 `RestartPreventExitStatus=1` 與 `RestartSec=5s`：
  結束碼 1 代表設定或憑證儲存區根本用不了，所以 unit 會停在 `failed` 等維運
  人員來看，而不是每五秒重試一次。其他失敗會重啟。
- `ProtectSystem=full`、`PrivateTmp`、`NoNewPrivileges`、`LimitNPROC`、
  `LimitNOFILE`：伺服器只拿到它需要的檔案系統視野與行程上限，不多拿。

兩條安裝路徑寫的是同一個檔案。一行安裝內嵌了 `scripts/pingclair.service` 的
逐位元組副本——兩者一旦分叉 `just repo-lint` 就會失敗——所以全新的
`curl | bash` 安裝與從倉庫安裝產出同一個 unit；兩條路徑下 `systemd-analyze verify
/etc/systemd/system/pingclair.service` 都不會就這個 unit 說任何話。

## 🎛️ 操作服務

`pc service` 就是這個 unit 的 `systemctl` 包裝，兩者可以互換：

| 目的 | 用 `pc` | 用 `systemctl` |
| --- | --- | --- |
| 啟動 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 重載設定 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 改動監聽器或行程級設定後重啟 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 查看狀態 | `pc service status` | `systemctl status pingclair` |
| 追蹤日誌 | — | `journalctl -u pingclair -f` |

`pc service status` 顯示的就是 unit 自己的視角，包括伺服器上報的就緒行：

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
       Docs: https://github.com/dorianverlaine/pingclair
   Main PID: 1808 (pingclair)
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

## 🔁 重載意味著什麼

改過的 `/etc/Pingclair/Pingclairfile` 透過一個訊號到達執行中的伺服器，送出它的
有兩條指令。

`SIGUSR1` 是重載訊號，本身不需要任何設定：

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload`——或者同一次呼叫的 `sudo systemctl reload pingclair`——替你
送出這個訊號。unit 的 `ExecReload` 是 `/bin/kill -USR1 $MAINPID`，那條理所當然的
指令現在就是能用的指令。過去送出 `SIGHUP` 的 unit 回報成功卻什麼都不套用，這點
記錄在 [issue #66](https://github.com/dorianverlaine/pingclair/issues/66)。

`pingclair reload` 透過 Admin API 走到同一段程式碼，並回報伺服器對檔案的判斷，
需要在全域選項區塊裡寫 `admin`：

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` 只能回報一件事：`kill` 把訊號送到了。伺服器是在那之後才讀
檔案的，所以它的判斷落在 unit 的 status line 與日誌裡。`pc service reload` 就
這麼說，而不是聲稱設定已經生效：

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

執行中的伺服器無法套用檔案所要求的內容時，舊設定會繼續服務，status line 會指出
被拒絕的是哪一處改動。把站台從 `:80` 搬到 `:8080` 是最常見的情形，因為監聽器
拓撲是啟動時連通訊端一起建立的：

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

無論走哪條路，編譯不過的設定都會讓舊設定繼續執行。先驗證：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

例外是與整個行程有關的策略。像 `trusted_proxies` 這樣在啟動時確立的選項，只有
重啟後才生效：`sudo pc service restart`。改動監聽器的設定也會被同樣地拒絕——
status line 會列出新增與移除的位址——因為重載套用的是策略，不是新的監聽
通訊端。

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
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 📋 Step 1/3: Validating configuration...
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

伺服器拒絕的重載也以同樣的方式記錄，帶上原因與「什麼都沒變」的說明：

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

想要獨立的、有輪替的日誌，就設定 `log` sink，寫到安裝程式建立並交給服務使用者的
`/var/log/pingclair` 底下。

## ⚠️ 服務起不來時

- **`is-active` 一直顯示 `activating`，`NRestarts` 不斷上升。** 這是安裝出來的
  舊 unit 已經退役的行為：它帶著 `Restart=always` 卻沒有
  `RestartPreventExitStatus`，所以伺服器拒絕的設定每五秒被重試一次，看起來不是
  一個「失敗一次」的 unit，而是「永遠不收斂」的 unit。還有第二個原因：它把
  `validate` 當作 `ExecStartPre` 跑，而 `RestartPreventExitStatus` 不覆蓋它。
  現在安裝出來的 unit 帶 `Restart=on-failure` + `RestartPreventExitStatus=1`，
  沒有前置指令，被拒絕的啟動會讓 `is-active` 停在 `failed`、`NRestarts` 停在
  0。在舊安裝上，除錯前先停掉迴圈：`sudo systemctl stop pingclair`，改好檔案，
  然後 `sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。** 伺服器在綁定任何東西之前拒絕了設定，編譯器的原因在 journal
  裡，例如
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`。**
  儲存區屬於服務帳號。用 `sudo ls -ld /var/lib/pingclair/certs` 確認擁有者是
  `pingclair`。
- **`systemd-analyze verify` 對已安裝的 unit 回報 `Missing '=', ignoring line`。**
  舊的一鍵安裝寫出的 unit 裡，註解被 shell 展開過——25 行 `--help` 輸出，
  `systemd` 會忽略它們。用目前的安裝程式重裝會把 unit 原樣寫入，這條回報就
  消失了。
- **unit 在跑但外面沒有任何應答。** 監聽器已綁定，請求沒到達。和
  [安裝](/zh-TW/start/install/) 一節一樣，先查服務商防火牆，再查主機自身規則。

## 🧭 下一步

- [升級與移除](/zh-TW/start/upgrade/)：重跑安裝程式會保留什麼，以及如何全部
  拆掉。
- [HTTPS](/zh-TW/start/https/)：憑證、儲存區位置，以及為什麼 `pingclair trust`
  需要 `PINGCLAIR_TLS_STORE`。
- [`log`](/zh-TW/reference/directives/#log)：本頁從 journal 裡讀到的存取日誌
  輸出目標。
