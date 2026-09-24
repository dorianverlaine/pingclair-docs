---
title: 以服務方式執行
h1_emoji: '🔁'
sidebar:
  order: 4
description: 已安裝的 systemd unit 做了什麼、如何啟動、停止與重載它、日誌寫到哪裡，以及設定出錯時從外部看起來是什麼樣子。
---

安裝程式會留下一個已啟用且正在執行的 `systemd` unit。本頁逐行解讀這個 unit、說明如何操作它，並描述兩種失敗從外部看起來的樣子：一種是伺服器無法啟動，另一種是執行中的伺服器拒絕了新設定。

## 🧾 unit 做了什麼

```bash
systemctl cat pingclair
```

重要的設定鍵如下：

```text
[Service]
Type=notify
NotifyAccess=main
User=pingclair
Group=pingclair
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment="RUST_LOG=info"
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

依序來看：

- `Type=notify` 與 `NotifyAccess=main`：伺服器會在監聽器綁定完成時通知 `systemd`，所以 `systemctl start` 會等到代理真的能回應才返回，而不是行程一出現就返回。
- `User=pingclair` 搭配 `AmbientCapabilities=CAP_NET_BIND_SERVICE`：伺服器以非特權身分執行，仍然可以綁定 80 與 443 連接埠。
- 這裡刻意沒有 `PINGCLAIR_TLS_STORE`。服務帳號的家目錄是 `/var/lib/pingclair`，所以憑證放在 `/var/lib/pingclair/.local/share/pingclair`：這是二進位檔自己的預設值、安裝程式建立並遷移進去的目錄，也是 `pingclair
  environ` 印出的路徑。在這裡再指定一個儲存區，等於替一個已經有答案的問題再給第二個答案。
- 這裡刻意沒有執行 `validate` 的 `ExecStartPre`。它看起來是做這項檢查最安全的位置，但正是陷阱所在：`systemd` 只把 `RestartPreventExitStatus=` 套用在主行程上，不套用在失敗的前置命令上，所以編譯器拒絕的設定曾經每五秒就被重試一次，而不是讓 unit 停在失敗狀態。伺服器會在綁定任何東西之前自行編譯檔案，拒絕時以 1 結束，而上面的重啟策略正是為這個結束碼寫的——`pingclair run` 就是為了當這個行程而存在。
- `ExecReload` 送出 `SIGUSR1`，伺服器把這個訊號視為「重新讀取檔案」。`SIGHUP` 會被刻意忽略；曾有 unit 送出它，回報成功，舊設定卻繼續在提供服務（[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。由於 `systemd` 只能看到 `kill` 結束了，伺服器會把它對檔案的處理結果發布在這個 unit 的狀態列上——`Serving (reloaded 1
  listener(s) in 323.341µs)` 或 `Reload rejected: …`——`systemctl status` 會顯示出來。完整說明見下方的[重載一節](#-重載意味著什麼)。
- `Restart=on-failure` 搭配 `RestartPreventExitStatus=1` 與 `RestartSec=5s`：結束碼 1 代表設定或憑證儲存區完全無法使用，所以 unit 會停在 `failed`，等維運人員查看，而不是每五秒重試一次。其他任何失敗都會重啟。
- `ProtectSystem=full`、`PrivateTmp`、`NoNewPrivileges`、`LimitNPROC` 與 `LimitNOFILE`：伺服器只拿到它需要的檔案系統視野與行程限制，僅此而已。

兩種安裝路徑寫出的都是同一個檔案。一行式安裝內嵌了 `scripts/pingclair.service` 逐位元組相同的副本——兩者一旦不同，`just repo-lint` 就會失敗——所以全新的 `curl | bash` 安裝與從原始碼 checkout 安裝會產生相同的 unit，而且在兩種路徑上，`systemd-analyze verify /etc/systemd/system/pingclair.service` 都不會對這個 unit 提出任何問題。

## 🎛️ 操作服務

`pc service` 包裝了針對這個 unit 的 `systemctl`，兩者可以互換：

| 工作 | 使用 `pc` | 使用 `systemctl` |
| --- | --- | --- |
| 啟動 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 重載設定 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 監聽器或全行程層級的變更後重啟 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 狀態 | `pc service status` | `systemctl status pingclair` |
| 追蹤日誌 | — | `journalctl -u pingclair -f` |

`pc service status` 會印出 unit 自己的視角，包括伺服器送出的就緒狀態：

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 05:57:21 UTC; 18s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
```

## 🔁 重載意味著什麼

修改過的 `/etc/Pingclair/Pingclairfile` 透過一個訊號送達執行中的伺服器，有兩個命令會送出它。

`SIGUSR1` 就是重載訊號，它本身不需要任何設定：

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload`——或是完全相同的 `sudo systemctl reload pingclair`——會替你送出這個訊號。unit 的 `ExecReload` 是 `/bin/kill -USR1 $MAINPID`，所以最直覺的那個命令現在就是能用的那個；過去送出 `SIGHUP` 的 unit 會回報成功卻什麼都沒套用，這正是 [issue #66](https://github.com/dorianverlaine/pingclair/issues/66) 記錄的問題。

`pingclair reload` 透過 Admin API 走到同一段程式碼，並回報伺服器對檔案的判定，因此需要全域選項區塊裡的 `admin` 選項：

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` 只能回報一件事：`kill` 送達了訊號。伺服器是在那之後才讀取檔案，所以判定結果會改送到 unit 的狀態列與 journal。`pc service reload` 會照實這樣說，而不是宣稱設定已經套用：

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

當執行中的伺服器無法套用檔案要求的內容時，舊設定會繼續提供服務，狀態列則會指出是哪一項變更被拒絕。最常見的情況是把網站從 `:80` 搬到 `:8080`，因為監聽器拓撲是在啟動時連同 socket 一起建立的：

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

不論走哪一條路，無法編譯的設定都會讓先前的設定繼續執行，網站也會繼續回應。請先驗證：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

執行中的行程無法吸收的變更是例外。啟動時就確定的選項（例如 `trusted_proxies`）只有在重啟後才會生效：`sudo pc service restart`。新增或搬移監聽器的設定也會以同樣方式被拒絕——狀態列會列出新增與移除的位址——因為重載套用的是政策，而不是新的監聽 socket。

## 🛑 停止意味著什麼

`systemctl stop` 會送出 `SIGTERM`。在 v0.2.0-rc.3 中，不論 `grace_period` 怎麼設定，行程都會在大約四分之一秒後結束，所以那一刻仍在進行的請求會被切斷，拿不到回應。請在可以接受短暫中斷時才停止或重啟；如果只改了網站設定，請優先使用重載。

📌 **下一版**。在 `main` 上，停止會先排空：`/ready` 回應 `503`、監聽器關閉、進行中的請求完成，最後一個請求結束或 `grace_period`（預設 30 秒）到期時，行程才結束。

## 📜 日誌

unit 設定了 `RUST_LOG=info`，並把所有輸出送到 journal：

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

啟動、重載、憑證作業，以及每個請求一行的存取紀錄都會出現在那裡：

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

伺服器拒絕的重載也會以同樣方式記錄，附上原因，並註明沒有任何變更：

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

若要一份獨立、可輪替的日誌，請設定 `log` 輸出，寫到 `/var/log/pingclair` 底下；這個目錄由安裝程式建立，並交給服務使用者擁有。

## ⚠️ 服務起不來時

- **`is-active` 顯示 `activating`，`NRestarts` 不斷增加。**這個 unit 是舊版安裝程式寫的，它有兩個缺陷。它帶有 `Restart=always` 卻沒有 `RestartPreventExitStatus`，而且以 `ExecStartPre` 命令執行 `validate`，而 `RestartPreventExitStatus` 管不到前置命令——所以編譯器拒絕的設定每五秒就被重試一次，看起來像是一個始終安定不下來的 unit，而不是一個已經失敗的 unit。現在安裝的 unit 帶有 `Restart=on-failure` + `RestartPreventExitStatus=1`，沒有前置命令，被拒絕的啟動會讓 `is-active` 停在 `failed`，`NRestarts` 為零。在舊的安裝上，除錯前請先停止這個迴圈：`sudo systemctl stop pingclair`，修好檔案，再執行 `sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。**伺服器在綁定任何東西之前就拒絕了設定，編譯器給的理由在 journal 裡，例如 ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`。**儲存區屬於服務帳號。請檢查 `sudo ls -ld /var/lib/pingclair/.local/share/pingclair`；擁有者應該是 `pingclair`。
- **`systemd-analyze verify` 對已安裝的 unit 回報 `Missing '=', ignoring line`。**舊版的一行式安裝寫出的 unit，其註解被 shell 展開了——變成 25 行 `--help` 輸出，`systemd` 會忽略它們。用目前的安裝程式重新安裝，就會原封不動地寫出 unit，這則回報也會消失。
- **unit 在執行，卻沒有任何回應。**監聽器已綁定，請求卻沒有抵達。請依[安裝頁面](/zh-TW/start/install/)的說明，先檢查供應商的防火牆，再檢查主機本身的。

## 🧭 下一步

- [升級與移除](/zh-TW/start/upgrade/)：重新執行會保留什麼，以及如何把它全部移除。
- [HTTPS](/zh-TW/start/https/)：憑證，包括儲存區的位置，以及 `pingclair trust` 為什麼需要 `PINGCLAIR_TLS_STORE`。
- [`log`](/zh-TW/reference/directives/#log)：本頁從 journal 讀取的存取日誌輸出。
