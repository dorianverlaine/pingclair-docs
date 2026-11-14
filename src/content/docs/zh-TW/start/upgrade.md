---
title: 升級與移除
h1_emoji: '🧹'
sidebar:
  order: 5
description: 安裝 v0.3 alpha 預覽版、保留穩定通道、驗證既有設定、保存憑證儲存區，並規劃回退。
---

**v0.3.0-alpha.1** 是 0.3 系列的預覽版。最新穩定版仍是 **v0.2.3**；預設安裝器
與 `latest` 容器標籤繼續跟隨穩定版。

替換二進位檔之前，請閱讀完整的
[升級前清單](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)。
先在預備環境測試，保留目前二進位檔與完整 TLS store，並保留穩定版能載入的設定。

## ⚠️ 預覽版的變更

| 領域 | 需要檢查的內容 |
| --- | --- |
| Layer 4 | 全域 `layer4` 區塊新增依 TLS SNI、ALPN 與來源位址路由原始 TCP，並支援靜態或動態 DNS 上游。既有 HTTP 設定不需要加入 Layer 4。 |
| Caddyfile 驗證 | 網站位址與 TLS 位置更貼近目前的 Caddyfile 規則。把明文放在 HTTPS 連接埠，或 scheme 與連接埠組合不一致的設定，會在載入時被拒絕。 |
| 錯誤路由 | `handle_errors` 現在可使用 `reverse_proxy`。請檢查原先依賴靜態 `respond` 的錯誤路由。 |
| 變數與記錄 | `map`、`invoke`、`log_append` 與 `log_name` 新增請求範圍值與存取記錄欄位。既有路由維持原設定。 |
| 路由代理 | `route` 區塊中的每個 `reverse_proxy` 會連到該區塊指定的上游。先前看似設定多個上游、實際全部連到第一個的設定，現在會照原意運作。 |
| 格式化 | `pingclair fmt` 會保留註解並格式化原始文字。覆寫正式檔案前，先檢查輸出。 |
| HTTP/3 | 格式錯誤的 transport 與 HTTP/3 輸入會收到 protocol close，不再等待逾時。設定不需要變更。 |
| 生命週期 | 停滯的請求本文寫入與升級連線半關閉會在設定的邊界結束；已完整抵達的上游回應仍會保留。 |

Alpha 新增 Layer 4；既有 HTTP 指令沒有移除。務必以新二進位檔驗證部署實際使用的設定。

## 📦 安裝預覽版

在安裝器加上 `--prerelease` 後，它會跟隨 R2 上的預先發行頻道，並用該頻道公布的
SHA-256 驗證選取的封存檔：

```bash
curl -fsSL https://releases.pingclair.com/pingclair/install.sh | sudo bash -s -- --prerelease
```

目前頻道指定 `v0.3.0-alpha.1`。安裝器會保留既有設定與 TLS store。
[安裝](/zh-TW/start/install/#-install-the-preview)說明共用的安裝器行為。無法連到
R2 時，安裝器會改用 GitHub 上最新的預先發行版，並驗證其校驗和檔案。

容器請固定精確的預先發行版標籤：

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.3.0-alpha.1
```

```bash
docker compose pull
docker compose up -d
docker compose logs pingclair
```

`latest` 不會前進到 alpha、beta 或 release candidate。

## 📦 保留先前的安裝

安裝預覽版前，備份設定、目前二進位檔與完整 TLS store。保留擁有權，並保護含私密金鑰的
備份。

安裝器會保留 `/etc/Pingclair/Pingclairfile`、`/var/lib/pingclair/.local/share/pingclair`
下的憑證儲存區與網站檔案。設定了 `storage file_system` 時，該路徑優先於預設儲存區。

保留穩定版 `v0.2.3` 二進位檔與對應設定。預覽版設定可能使用穩定版無法載入的指令。

## 🛡️ 切換前檢查

舊二進位檔仍在時，先以預覽版二進位檔驗證正式設定：

```bash
./pingclair validate /etc/Pingclair/Pingclairfile
```

執行驗證的使用者必須能讀取檔案中的每個憑證與金鑰。驗證成功不會開啟監聽器，也不代表
部署的 DNS、防火牆或 Layer 4 後端路由已正確。

在預備環境測試部署使用的 HTTP 協定，以及每個新增的 Layer 4 監聽器。Layer 4 應確認
目標 SNI 或來源位址會選取預期上游，且 TLS 握手由上游完成。

## ⏪ 回退

停止預覽版服務，以原始擁有權還原先前的二進位檔、設定與 TLS store，再以還原的二進位檔
驗證後啟動。

不要以不完整的備份覆寫執行中的憑證儲存區。完成回退決策之前，預覽版設定應與穩定版設定
分開保存。

## 🧹 移除安裝

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

這些命令會保留 `/etc/Pingclair`、`/var/lib/pingclair` 與 `/var/log/pingclair`，
包括憑證與網站檔案。只有重新安裝或回退不再需要時，才刪除保留資料。

<span id="️-020-的變更"></span>

## 🕰️ 從 0.1.x 或 0.2 升級

[0.2.0 升級前章節](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)
仍是 0.2 系列對路由順序、路徑正規化、監聽器綁定、用戶端識別、壓縮、快取、Admin API、
指標、TLS、上游與生命週期變更的參考。套用這些變更前，先以預覽版驗證既有檔案並保留
穩定版回退路徑。

## 🧭 後續步驟

- [安裝](/zh-TW/start/install/)：穩定版與預覽版安裝路徑。
- [Layer 4 指南](/zh-TW/guides/layer4/)：TCP 路由設定與邊界。
- [專案狀態](/zh-TW/project/status/)：預覽版的已知限制。
