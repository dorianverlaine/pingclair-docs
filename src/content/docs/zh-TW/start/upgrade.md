---
title: 升級與移除
h1_emoji: '🧹'
sidebar:
  order: 5
description: 重跑安裝程式完成升級、固定容器 tag、回滾到舊版本，並在不丟值得保留的東西的前提下全部拆掉。
---

一次升級只替換兩樣東西 —— 二進位檔與 service unit —— 你的設定與憑證不動。本頁
示範這件事、容器裡的對應做法、必須往回退時的回滾路徑，以及拆除步驟。

## 🧾 什麼能撐過什麼

| 路徑 | 升級時 |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | 保留。安裝程式只在它缺失時才寫入。 |
| `/etc/Pingclair/Pingclairfile.example` | 被目前範例替換。 |
| `/var/lib/pingclair/certs` | 保留。已簽發的憑證與 ACME 狀態原地不動。 |
| `/var/lib/pingclair/html` | 保留。 |
| `/usr/local/bin/pingclair` 與 `pc` | 被新版本替換。 |
| `/etc/systemd/system/pingclair.service` | 被重寫，然後服務重啟。 |

## ⬆️ 用安裝程式升級

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

指令稿向 GitHub 查詢最新 release tag、印出來、驗證壓縮包的 SHA-256、替換二進位
檔與 unit，然後重啟服務。已經存在的設定檔不會被碰，這才使它成為升級而不是重置：

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

確認新版本，並確認舊設定仍在提供服務：

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

安裝程式總是裝最新 release。沒有指定版本的旗標；需要特定版本時，用下面的回滾。

## 🐳 升級容器

主機上什麼都沒裝，所以升級就是改 tag 再 pull。在 compose 檔案裡固定新版本：

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

設定與憑證儲存區都在磁碟區裡，所以新容器會在舊容器留下的位置找到它們。兩點要
注意：

- **對映了 80 連接埠的容器，在 systemd 服務執行時起不來。** 停掉其中一個：
  `sudo pc service stop`，或者改容器一側的發佈連接埠。
- **`latest` 會跟隨最新 release。** 正式環境請固定版本，讓升級是一個決定，而不是
  一次 pull 的副作用。

## ⏪ 回滾到舊版本

新版本必須退回去時，從發佈主機取上一個版本，用它公佈的 digest 核對，然後替換
二進位檔：

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

然後針對回滾後的版本驗證設定，因為舊版本沒有實作的指令會按名字被拒絕，而不是被
忽略：

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

之後 `systemctl status pingclair` 會回答 `Unit pingclair.service could not be
found`，指令消失，80 連接埠上沒有任何監聽。留在磁碟上的，是刻意保留的你的資料：

```text
/etc/Pingclair/Pingclairfile      設定，仍然有效
/var/lib/pingclair/certs          已簽發憑證與 ACME 狀態
/var/lib/pingclair/html           預留網站
/var/log/pingclair                日誌輸出目錄
```

如果打算重新安裝，請保留 `/var/lib/pingclair/certs`：憑證與內部根都會存活，
信任該根的用戶端也繼續可用。若這台主機不再使用 Pingclair，就全部刪掉，包括服務
帳號：

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ 出問題時

- **裝上了意料之外的版本。** 安裝程式總是取最新的 release tag。用
  `pingclair version` 確認；如果確實需要特定版本，用上面的回滾。
- **升級後服務起不來。** 讀
  `sudo pingclair validate /etc/Pingclair/Pingclairfile`。新版本拒絕的指令會
  帶著名字與替代方案 fail closed，journal 會指出要改哪一行。
- **容器立刻結束。** `docker logs <container>` 會說明原因。常見原因是掛載的設定
  目錄裡沒有 `/etc/pingclair/Pingclairfile`，或者主機上連接埠已被占用。
- **重建儲存區後用戶端拒絕憑證。** 內部憑證授權單位重新產生後，舊根不再簽任何
  東西。用 `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust`
  裝新的根。

## 🧭 下一步

- [安裝](/zh-TW/start/install/)：本頁保留或刪除的目錄配置。
- [以服務方式執行](/zh-TW/start/service/)：升級會重寫的 unit。
- [專案狀態](/zh-TW/project/status/)：目前版本支援什麼、拒絕什麼。
