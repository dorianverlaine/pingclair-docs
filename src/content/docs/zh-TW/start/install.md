---
title: 安裝
h1_emoji: '📦'
sidebar:
  order: 1
description: 用發行版二進位檔、Docker 或原始碼把 Pingclair 裝到 Linux 主機上，並確認服務有回應。
---

Pingclair 以單一 Linux 二進位檔發布。本頁說明 **v0.2.2** 的安裝步驟、檔案位置與服務檢查方式。

## 🧾 你需要準備的

- 一台 `x86_64` 或 `aarch64` 的 Linux 主機；兩種架構都有發行版二進位檔。
- `sudo` 或 root 權限：安裝程式會寫入 `/usr/local/bin`、`/etc/Pingclair`、`/var/lib/pingclair` 與 `/etc/systemd/system`。
- 走服務路線需要 `systemd`。沒有 `systemd` 的主機，請改用 Docker，或在前景執行伺服器；兩者下面都有說明。
- 如果要取得公開憑證，80 與 443 連接埠必須能從網際網路連到（[HTTPS](/zh-TW/start/https/)）。在雲端執行個體上，這通常也代表要在供應商的防火牆裡開放它們。

macOS 可以從原始碼編譯，並支援用於開發，但不是正式發布的平台。

## 📦 從發行版二進位檔安裝

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

這支腳本會讀取 `releases.pingclair.com` 上的發行頻道，印出即將安裝的 tag，並用該頻道為這個封存檔公布的 SHA-256 進行比對——不相符的封存檔會被拒絕，不會解開。如果連不到那台主機，它會退回使用 GitHub releases API 與封存檔旁公布的校驗和檔案，所以安裝不必依賴單一供應商。接著它會建立服務使用者、授予該使用者綁定低號連接埠的 capability、寫入預設設定、安裝 unit，並啟動服務。

若要使用尚未發行的修正，請改為在主機上編譯 `main`：

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main` 會在主機上 clone 並編譯伺服器。它需要 Rust 1.99 或更新版本，以及 BoringSSL 與 jemalloc 所需的 C 工具鏈：`cmake`、`clang`、`libclang-dev`、`g++` 與 `git`。腳本在 `apt` 與 `dnf` 系統上都會自行安裝這些套件。由於 BoringSSL 要從原始碼編譯，第一次建置需要好幾分鐘。

## 🗂️ 安裝程式留下了什麼

| 路徑 | 內容 |
| --- | --- |
| `/usr/local/bin/pingclair` | 伺服器二進位檔。 |
| `/usr/local/bin/pc` | 指向同一個二進位檔的符號連結，用於簡寫。 |
| `/etc/Pingclair/Pingclairfile` | 服務執行的設定。 |
| `/etc/Pingclair/Pingclairfile.example` | 附註解的範例，升級時不會被覆寫。 |
| `/var/lib/pingclair/.local/share/pingclair` | 憑證儲存區：也就是服務使用者的資料目錄，二進位檔預設就會在這裡找。 |
| `/var/lib/pingclair/html` | 在 80 連接埠上提供的佔位網站。 |
| `/var/log/pingclair` | 設定了 `log` 輸出之後，日誌寫入的位置。 |
| `/etc/systemd/system/pingclair.service` | unit，已啟用並正在執行。 |

安裝完成後，服務使用下列預設設定提供歡迎頁面：

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

服務使用者與憑證儲存區只在不存在時才會建立，既有的 `/etc/Pingclair/Pingclairfile` 也永遠不會被取代。正因如此，重新執行安裝程式等於升級，而不是重設（[升級與移除](/zh-TW/start/upgrade/)）。

## ✅ 確認安裝結果

檢查已安裝的版本：

```bash
pingclair version
```

0.2.2 發行版會顯示 `v0.2.2`。`pc version` 會顯示相同版本。接著檢查服務狀態：

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` 來自伺服器本身，而不是 `systemd` 看到一個「還活著」的行程就算數：這個 unit 的類型是 `notify`，伺服器要等所有監聽器都綁定完成後才會回報就緒。

最後，直接問伺服器：

```bash
curl -i http://localhost/
```

帶有 `ETag` 與 `Last-Modified` 的 `200` 代表回應來自檔案伺服器，本文就是 `/var/lib/pingclair/html` 裡的佔位頁面。

## 🐳 Docker

公開的映像檔以設定檔模式執行：entrypoint 是 `pingclair`，預設命令是 `run /etc/pingclair/Pingclairfile`。映像檔把 `/etc/pingclair` 與 `/var/lib/pingclair` 宣告為 volume，並公開 80 與 443 連接埠。

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv:ro
      - pingclair_tls:/var/lib/pingclair

volumes:
  pingclair_tls:
```

```bash
mkdir -p conf site
printf ':80 {\n    file_server /srv\n}\n' > conf/Pingclairfile
echo '<h1>hello from the container</h1>' > site/index.html
docker compose up -d
curl -i http://localhost/
```

有三點很容易弄錯：

- **不要加 `command:`。** 映像檔的預設值已經是 `run /etc/pingclair/Pingclairfile`，覆寫它就會取代這個命令。
- **掛載整個 `/var/lib/pingclair`，而不只是憑證目錄。** 儲存區會在憑證旁邊保存狀態，只掛載一部分的容器在重建後就會遺失這些狀態。
- **固定使用已發行的 tag。** `latest` 會跟著最新的發行版走；正式環境應該像範例一樣寫明版本。公開的 tag 列在[套件頁面](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)上。

如果你的使用者不在 `docker` 群組裡，請在命令前加上 `sudo`，或用 `sudo usermod -aG docker "$USER"` 加入群組一次，再開啟新的登入工作階段。在 Ubuntu 上，`docker compose` 外掛來自 `docker-compose-v2` 套件。

## 🛠️ 從原始碼編譯

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

需求：Rust 1.99.0（CI 固定的版本）、`cmake`、`clang`、`libclang-dev`、`g++` 與 `git`。BoringSSL 會在建置過程中從原始碼編譯，所以第一次建置需要好幾分鐘。

## ⚠️ 安裝失敗時

- **`This script must be run as root`。** 腳本會寫入家目錄以外的位置並安裝 unit。請用 `sudo` 重新執行。
- **Fedora 上出現 `setcap: command not found`。** 那是 `libcap` 套件。安裝程式會自動加裝，但手動建置的主機可能沒有；少了這個 capability，服務就無法綁定 80 與 443 連接埠。
- **安裝完立刻出現 `Job for pingclair.service failed`。** 請看 `journalctl -u pingclair -n 20`。常見原因是設定沒通過驗證，或 80 連接埠已經有其他程式在監聽。
- **服務在執行，但從外部連不到。** 監聽器已經綁定，封包卻始終沒有抵達。請先檢查供應商的防火牆或安全群組，再檢查主機本身的規則。
- **主機沒有 `systemd`。** 二進位檔已經裝好也能用，但安裝程式的服務步驟無法執行。請改用 Docker，或 `pingclair run`。

## 🧹 再次移除

[升級與移除](/zh-TW/start/upgrade/)會帶你完成移除，並指出哪些目錄存有值得保留的資料。

## 🧭 下一步

- [快速開始](/zh-TW/start/quickstart/)：用你自己的設定取代佔位設定，提供一個真正的網站。
- [HTTPS](/zh-TW/start/https/)：為公開網域名稱取得憑證。
- [以服務方式執行](/zh-TW/start/service/)：unit 做了什麼，以及如何安全地重載。
