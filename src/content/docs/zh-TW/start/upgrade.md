---
title: 升級與移除
h1_emoji: '🧹'
sidebar:
  order: 5
description: 重新執行安裝程式來升級、固定容器 tag、回滾到較舊的發行版，以及在不遺失重要資料的前提下把一切移除。
---

升級只會取代兩樣東西——二進位檔與服務 unit——你的設定與憑證都不會被動到。本頁說明這一點、容器的對應做法、需要退回舊版時的回滾路徑，以及如何移除。

## 🧾 哪些東西會保留

| 路徑 | 升級時 |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | 保留。安裝程式只在它不存在時才寫入。 |
| `/etc/Pingclair/Pingclairfile.example` | 以目前的範例取代。 |
| `/var/lib/pingclair/.local/share/pingclair` | 保留。已簽發的憑證與 ACME 狀態原封不動。 |
| `/var/lib/pingclair/html` | 保留。 |
| `/usr/local/bin/pingclair` 與 `pc` | 以新的發行版取代。 |
| `/etc/systemd/system/pingclair.service` | 重新寫入，接著重啟服務。 |

## ⬆️ 用安裝程式升級

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

腳本會在發行頻道上找到最新的發行版、印出它的 tag、驗證封存檔的 SHA-256、取代二進位檔與 unit，然後重啟服務。連不到頻道主機時，它會改問 GitHub releases API；下面這次執行走的就是這條路，所以才會印出 `Fetching latest release`。已經存在的設定檔不會被動到，這正是它算升級而不是重設的原因：

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

確認新版本，以及舊設定仍在提供服務：

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

安裝程式永遠安裝最新的發行版，沒有指定版本的旗標；需要特定版本時，請用下面的回滾方式。

## ⚠️ 升級到 0.2.0 之前先讀升級說明

下一版會改變一些即使設定沒動也察覺得到的行為：哪一條路由回應請求、沒有 `encode` 的網站是否壓縮、預設的請求本文上限、`remote_ip` 匹配什麼，以及內部憑證授權單位把根憑證放在哪裡。[專案狀態](/zh-TW/project/status/#-下一版有哪些變動)做了摘要，[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) 則為每一項附上升級說明。在用新的二進位檔重啟服務之前，先用它驗證你的設定。

## 🐳 升級容器

主機上沒有安裝任何東西，所以升級就是改 tag 再 pull。在 compose 檔案裡固定新的發行版：

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
```

```bash
docker compose pull
docker compose up -d
docker logs pingclair 2>&1 | head -3
```

```text
🚀 Starting Pingclair with config: /etc/pingclair/Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: /etc/pingclair/Pingclairfile
```

設定與憑證儲存區都在 volume 裡，所以新容器會在舊容器留下的位置找到它們。有兩件事要注意：

- **systemd 服務執行時，對應 80 連接埠的容器無法啟動。**請停掉其中一個：`sudo pc service stop`，或更改容器端公開的連接埠。
- **`latest` 會跟著最新的發行版走。**正式環境請固定版本，讓升級成為一個決定，而不是 pull 的副作用。

## ⏪ 回滾到較舊的發行版

當新的發行版必須撤下時，從發行主機取得前一版，用該發行版公布的摘要值驗證，再用它取代二進位檔：

```bash
mkdir -p /tmp/rollback && cd /tmp/rollback
version=0.2.0-rc.2
base="https://releases.pingclair.com/pingclair/releases/$version"
curl -fsSL "$base/release.json" -o release.json
tarball=pingclair-linux-x86_64.tar.gz
expected="$(jq -r ".assets[] | select(.name == \"$tarball\") | .digest" release.json | sed 's/^sha256://')"
curl -fsSLO "$base/$tarball"
printf '%s  %s\n' "$expected" "$tarball" | sha256sum -c -
mkdir -p extract && tar -xzf "$tarball" -C extract
```

```text
pingclair-linux-x86_64.tar.gz: OK
```

```bash
sudo systemctl stop pingclair
sudo install -m 0755 extract/pingclair /usr/local/bin/pingclair
sudo systemctl start pingclair
pingclair version
```

```text
v0.2.0-rc.2
```

接著用回滾後的版本驗證設定，因為較舊的發行版沒有實作的指令會被指名拒絕，而不是被忽略：

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## 🧹 移除

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

完成後，`systemctl status pingclair` 會回答 `Unit pingclair.service could
not be found`，命令不見了，80 連接埠上也沒有東西在監聽。磁碟上留下的是你的資料，這是刻意的：

```text
/etc/Pingclair/Pingclairfile      the configuration, still valid
/var/lib/pingclair/.local/share/pingclair          issued certificates and ACME state
/var/lib/pingclair/html           the placeholder site
/var/log/pingclair                a log sink's directory
```

如果打算重新安裝，請保留 `/var/lib/pingclair/.local/share/pingclair`：憑證與內部根憑證都會留下來，信任該根憑證的用戶端也能繼續運作。當這台主機不再使用 Pingclair 時，再把包括服務帳號在內的一切刪除：

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ 出問題時

- **安裝程式裝了你沒預期的版本。**它永遠取最新的發行版 tag。用 `pingclair version` 確認；如果需要特定版本，請使用上面的回滾方式。
- **升級後服務無法啟動。**請執行 `sudo pingclair validate /etc/Pingclair/Pingclairfile`。新發行版拒絕的指令會以封閉失敗的方式處理，並附上名稱與替代方案，所以 journal 會指出要改的是哪一行。
- **容器一啟動就結束。**`docker logs <container>` 會說明原因。常見原因是掛載的設定目錄裡缺少 `/etc/pingclair/Pingclairfile`，或主機上的連接埠已被佔用。
- **重建儲存區後，用戶端拒絕憑證。**如果內部憑證授權單位重新產生過，舊的根憑證就不再簽發任何東西。請用 `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust` 安裝新的根憑證。

## 🧭 下一步

- [安裝](/zh-TW/start/install/)：本頁保留或移除的檔案配置。
- [以服務方式執行](/zh-TW/start/service/)：升級時會重寫的 unit。
- [專案狀態](/zh-TW/project/status/)：目前的發行版支援什麼、拒絕什麼。
