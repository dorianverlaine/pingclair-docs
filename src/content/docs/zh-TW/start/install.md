---
title: 安裝
h1_emoji: '📦'
sidebar:
  order: 1
description: 在 Linux 主機上以發行版二進位檔、Docker 或原始碼安裝 Pingclair，並驗證服務能夠回應。
---

Pingclair 以單一 Linux 二進位檔發佈。本頁完成安裝、說明安裝程式留下了什麼，
並驗證伺服器能夠回應。目前版本是 **v0.2.0-rc.3**，屬於 release candidate，
本站每一頁描述的都是這個版本。

## 🧾 需要什麼

- 一台 `x86_64` 或 `aarch64` 的 Linux 主機，兩種架構都有發行版二進位檔。
- `sudo` 或 root：安裝程式會寫入 `/usr/local/bin`、`/etc/Pingclair`、
  `/var/lib/pingclair` 與 `/etc/systemd/system`。
- 走服務方式需要 `systemd`。沒有 systemd 的主機請改用 Docker 或前景執行，
  兩者下面都會談到。
- 若要簽發公開憑證，80 與 443 連接埠要能從公網連上（[HTTPS](/zh-TW/start/https/)）。
  在雲端主機上，通常還要在服務商的防火牆一併開放。

macOS 的原始碼建置只用於開發支援。macOS 不是發行平台。

## 📦 從發行版二進位檔安裝

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

指令稿先讀 `releases.pingclair.com` 上的發佈通道，印出即將安裝的 tag，再用通道
為該壓縮檔公佈的 SHA-256 核對——對不上就拒絕，不解壓。該主機連不上時會退回
GitHub 的 release API 與壓縮檔旁邊公佈的檢查碼檔案，因此安裝不依賴單一提供者。
接著它建立服務使用者、授予綁定低連接埠的能力、寫入預設設定、安裝 unit，並
啟動服務。完整跑完會這樣結束：

```text
Detected architecture: x86_64
Installing v0.2.0-rc.3 — a release candidate, not a final release.
Downloading https://releases.pingclair.com/pingclair/releases/0.2.0-rc.3/pingclair-linux-x86_64.tar.gz (from releases.pingclair.com)...
✅ sha256 matches the release channel document
Creating system user 'pingclair'...
Setting capabilities...
Configuring directories and assets...
Fetching default landing page...
Creating default Pingclairfile...
Installing Systemd service...
Creating 'pc' symlink...
✅ Installation Complete!
Use pc service status to check the service.
Config: /etc/Pingclair/Pingclairfile
```

需要尚未發佈的修正時，可以安裝 `main` 而不是發行版二進位檔：

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main` 會在主機上複製並編譯。它需要 Rust 1.98 或更新版本，以及 BoringSSL 與
jemalloc 所需的 C 工具鏈：`cmake`、`clang`、`libclang-dev`、`g++` 與 `git`。
在 `apt` 與 `dnf` 系統上，這些套件都由指令稿自行安裝。因為 BoringSSL 要從
原始碼編譯，首次建置需要數分鐘。

## 🗂️ 安裝程式留下了什麼

| 路徑 | 內容 |
| --- | --- |
| `/usr/local/bin/pingclair` | 伺服器二進位檔。 |
| `/usr/local/bin/pc` | 指向同一二進位檔的符號連結，用於短指令。 |
| `/etc/Pingclair/Pingclairfile` | 服務實際執行的設定。 |
| `/etc/Pingclair/Pingclairfile.example` | 帶註解的範例，升級時不會被覆蓋。 |
| `/var/lib/pingclair/certs` | 憑證儲存區，由 unit 中的 `PINGCLAIR_TLS_STORE` 指定。 |
| `/var/lib/pingclair/html` | 在 80 連接埠提供的預留網站。 |
| `/var/log/pingclair` | 設定 `log` 之後日誌寫入的位置。 |
| `/etc/systemd/system/pingclair.service` | 已啟用並正在執行的 unit。 |

指令稿結束時服務已經在提供服務。它執行的設定就是這份預留設定，一螢幕就能讀完：

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

服務使用者與憑證儲存區只在缺少時建立，既有的 `/etc/Pingclair/Pingclairfile`
永遠不會被取代。正因如此，重複執行安裝程式是升級而不是重置
（[升級與移除](/zh-TW/start/upgrade/)）。

## ✅ 驗證安裝

先問二進位檔自己的版本：

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc` 是同一個二進位檔，所以 `pc version` 輸出同樣的字串。再問 `systemd`：

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://github.com/dorianverlaine/pingclair
   Main PID: 1808 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` 不是 `systemd` 看到行程還活著而猜出來的，而是伺服器自己
上報的：unit 的型別是 `notify`，只有所有監聽器都綁定完成之後，伺服器才宣告
就緒。

最後問伺服器本身：

```bash
curl -i http://localhost/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 18747
Last-Modified: Tue, 22 Sep 2026 03:21:54 GMT
ETag: "493b-6ab1f452"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

帶著 `ETag` 與 `Last-Modified` 的 `200` 表示檔案伺服器已經回應，內容就是
`/var/lib/pingclair/html` 裡的預留頁面。

## 🐳 Docker

已發佈的映像以設定檔模式執行：entrypoint 是 `pingclair`，預設指令是
`run /etc/pingclair/Pingclairfile`。映像把 `/etc/pingclair` 與
`/var/lib/pingclair` 宣告為磁碟區，並開放 80 與 443 連接埠。

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
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

有三個容易搞錯的地方：

- **不要加 `command:`。** 映像預設值已經是
  `run /etc/pingclair/Pingclairfile`，覆蓋它會取代掉那條指令。
- **不要只掛 `/var/lib/pingclair/certs`。** 儲存區除了憑證目錄之外還保存其他
  狀態，容器只掛 `certs` 重建時會遺失這些狀態。請掛 `/var/lib/pingclair`。
- **固定發佈 tag。** `latest` 會跟隨最新發佈，正式環境應寫明版本，如上面的
  範例。已發佈的 tag 列在
  [套件頁面](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)。

在使用者不屬於 `docker` 群組的主機上，請在指令前加 `sudo`，或以
`sudo usermod -aG docker "$USER"` 加入一次並重新登入。在 Ubuntu 上，
`docker compose` 外掛來自 `docker-compose-v2` 套件。

## 🛠️ 從原始碼建置

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

需求：Rust 1.98.1（CI 固定的版本）、`cmake`、`clang`、`libclang-dev`、`g++`
與 `git`。建置過程會從原始碼編譯 BoringSSL，因此首次建置需要數分鐘。

## ⚠️ 安裝失敗時

- **`This script must be run as root`。** 指令稿會寫到主目錄之外並安裝 unit，
  請加上 `sudo` 重新執行。
- **Fedora 上 `setcap: command not found`。** 那是 `libcap` 套件。安裝程式會
  裝它，但手工建置的主機可能缺少，而沒有這個能力服務就無法綁定 80 與 443。
- **安裝後立刻 `Job for pingclair.service failed`。** 讀
  `journalctl -u pingclair -n 20`。常見原因是設定未通過驗證，或者已經有別的
  行程占著 80 連接埠。
- **服務在跑，但從外面沒有任何回應。** 監聽器已綁定，封包沒有到達。先檢查
  服務商的防火牆或安全群組，再檢查主機本身的規則。
- **主機沒有 `systemd`。** 二進位檔裝好可以執行，但安裝程式的服務步驟無法
  執行。請使用 Docker，或 `pingclair run`。

## 🧹 移除

[升級與移除](/zh-TW/start/upgrade/) 給出了拆除步驟，並指出哪些目錄值得保留。

## 🧭 下一步

- [快速開始](/zh-TW/start/quickstart/)：把預留頁面換成你自己的設定，提供真實
  網站。
- [HTTPS](/zh-TW/start/https/)：為公開網域簽發憑證。
- [以服務方式執行](/zh-TW/start/service/)：unit 做了什麼，以及如何安全地重載。
