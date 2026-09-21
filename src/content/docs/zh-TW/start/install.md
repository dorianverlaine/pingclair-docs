---
title: 安裝
h1_emoji: '📦'
description: 從發行版二進位檔、Docker 或原始碼安裝 Pingclair。
---

Pingclair 以 Linux 為目標平台。發行版二進位檔提供 `x86_64` 與 `aarch64` 兩種架構；macOS 可以從原始碼編譯，主要供開發使用，並非發行平台。

## 📌 發行狀態

預設安裝目標是 **v0.2.0-rc.3**，屬於 release candidate。安裝腳本會印出它實際安裝的標籤，並在解壓縮前驗證已公布的 SHA-256 檢查碼。

`v0.1.x` 系列已不再維護：沒有修正、沒有回溯移植、也沒有安全公告。其中一個升級理由是，`v0.1.x` 會解析 Admin API 的 `api_key` 欄位卻從未讀取，等於該欄位沒有任何保護作用。

## 📦 從發行版二進位檔安裝

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

安裝腳本會下載對應目前架構的發行版二進位檔、驗證檢查碼、安裝 `pingclair` 與 `pc` 別名、建立非特權的 `pingclair` 使用者、授予該使用者綁定低連接埠所需的 capability，並安裝 `systemd` unit。

若要改為編譯並安裝 `main` 分支：

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main` 會在本機編譯伺服器，需要 Rust 1.98 以上版本，以及 BoringSSL 與 jemalloc 所需的 C 工具鏈：`cmake`、`clang`、`libclang-dev`、`g++`、`git`。

驗證安裝結果：

```bash
pingclair version
pc version
```

## 🐳 Docker

映像檔本身已經是 config-file 模式：entrypoint 是 `pingclair`，預設指令是 `run /etc/pingclair/Pingclairfile`。因此 Compose 服務只需要掛載設定檔與資料儲存區。

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv
      - pingclair_tls:/var/lib/pingclair/certs

volumes:
  pingclair_tls:
```

把 `Pingclairfile` 放在 `./conf/`，靜態檔案放在 `./site/`，設定中以容器內的絕對路徑引用，例如 `root /srv`。HTTPS、80 埠轉址與 HTTP/3 的行為，與在主機上部署完全相同。

兩個容易出錯的地方：

- **🔒 TLS 儲存區是狀態，不是快取。** 它存放已簽發的憑證、ACME 帳號金鑰，以及內部憑證授權單位。刪掉它等於要重新簽發憑證，信任的用戶端也必須改信新的內部根憑證。
- **⚠️ 不要加 `command:`。** 映像檔預設指令已經是 `run /etc/pingclair/Pingclairfile`，覆寫它會取代該指令。

正式環境請固定使用發行標籤，而不是 `latest`。已發布的標籤列在[套件頁面](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)。

## 🛠️ 從原始碼編譯

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

需求：Rust 1.98.1（CI 固定的版本）、`cmake`、`clang`、`libclang-dev`、`g++`、`git`。BoringSSL 會在編譯過程中從原始碼建置，因此第一次編譯需要數分鐘。

## 🧭 下一步

- [快速開始](/zh-TW/start/quickstart/)：第一份設定，驗證後實際運行。
- [設定模型](/zh-TW/concepts/configuration/)：驗證機制如何決定什麼能執行。
