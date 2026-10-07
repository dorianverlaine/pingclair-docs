---
title: 升級與移除
h1_emoji: '🧹'
sidebar:
  order: 5
description: 將 0.1.x 或 0.2.0 候選版本的設定升級至 0.2.0，保留憑證儲存區、驗證新版本，並準備回復。
---

**0.2.0** 改變既有設定的路由、綁定位址、壓縮與用戶端識別行為。從 **0.2.0-rc.N** 升級也需要檢查。替換二進位檔之前，請閱讀完整的 [Before you upgrade 清單](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md#️-before-you-upgrade)及各項連結。以下整理最可能影響部署的變動。

## ⚠️ 0.2.0 的變更

| 檢查項目 | 需要調整或預期的結果 |
| --- | --- |
| 路由 | 依指令順序選出第一條匹配路由。全域匹配的 `redir`、`route` 或 `handle` 可排在較具體的 `respond` 之前。使用互斥的 `handle` 區塊或明確的 `route` 順序。 |
| 路徑 | 忽略 ASCII 大小寫，並解碼一次百分比編碼。`handle_path` 與 URI 移除也忽略大小寫。大括號是字面值；擷取群組或區分大小寫時使用 `path_regexp`。等長的同層路徑保留檔案順序。 |
| 區塊匹配器 | `handle`、`handle_path` 與 `route` 只接受 `*`、`/path` 或 `@name`。將 `handle *.php` 改成具名的 `path *.php` 匹配器。 |
| 監聽器 | `bind` 適用於明確位址、連接埠及自動重新導向。`listen` 保留指定的 IP。`bind` 與 `default_bind` 只接受一個位址。同一連接埠共用監聽器；受 bind 限制的網站與全介面監聽器並存時會被拒絕。 |
| 位址 | 具名網站帶連接埠但沒有 scheme 時使用 HTTPS。明文請寫 `http://`。只有 scheme 的位址使用全域連接埠。`[::1]` 是網站名稱；同一連接埠的 `0.0.0.0` 與 `[::]` 合併為 IPv6 監聽器。 |
| 用戶端識別 | `servers` 內每個範圍只寫一次 `trusted_proxies static …`。需要時將 `CF-Connecting-IP` 列入 `client_ip_headers`。`client_ip` 與 `{client_ip}` 是轉送的用戶端；`remote_ip` 與 `{remote_host}` 是對端。`{remote_ip}` 會被拒絕。 |
| 請求限制 | 本文大小沒有預設上限；需要時設定 `request_body { max_size … }`。標頭完成與本文兩次讀取之間的停頓預設皆為 60 秒；安靜的上傳可能需要較長的 `limits { body_timeout … }`。 |
| 錯誤頁 | `handle_errors` 現在也處理閘道、逾時與 `413` 錯誤。自己的 `root` 與 `file_server` 會以錯誤狀態提供頁面。必要時用狀態碼限制原本的全域錯誤區塊。 |
| 編碼 | 沒有 `encode` 就不壓縮。區塊、gzip 等級（預設 5）、回應匹配器與最小長度皆生效。`encode off` 不接受區塊。靜態回應一律依編碼變化；有 encode 的網站代理回應亦同。重新編碼弱化代理 ETag；靜態與 sidecar 驗證值會改變。`no-transform` 停用編碼。 |
| 回應快取 | 新鮮度包含上游年齡。所有快取路由的 `max_size` 必須一致；重載會套用容量變更。`flush_interval -1` 不納入快取。所有 `Vary` 行都參與變體；無效 `Vary` 與 `Vary: *` 不儲存。 |
| Admin API | 不存在的設定讀取回應 `200 null`。讀取會遮蔽機密，重新載入匯出內容前須還原。設定寫入遵守帶路徑的 `If-Match`；收到 `412` 後重新讀取該路徑與 ETag。重載期間仍可讀取。 |
| 指標 | 加入全域 `metrics` 才會收集，否則擷取端點回應空本文。儀表板需改用[重新命名的 `caddy_*` 系列](/zh-TW/reference/admin-api/#-指標)。 |
| 命令列 | 可用 `--config`／`-c` 與 `--adapter caddyfile\|json`，不可同時提供位置參數路徑。沒有預設檔案時 `run` 只啟動管理端點；檔案缺少必須失敗時請指定路徑。`validate` 現在解析 TLS 檔案並檢查金鑰配對。 |
| TLS | 內部 CA 移至 `pki/authorities/local/`，不遷移舊資料；須重新信任根憑證。精確名稱不再繼承萬用字元的 `client_auth`，需要時明確加入。手動 TLS 必須有網站名稱。 |
| 上游 | 權重 0 排空上游；大於 100 及所有主要上游皆為 0 會驗證失敗。`lb_try_duration` 限制新嘗試，不限制進行中的回應。上游可能收到請求後僅重試冪等方法。 |
| 協定 | CONNECT 得到 `405` 並關閉 H1；沒有可用連接埠的目標得到 `400`。HTTP/1 格式錯誤的目標與 chunked 本文得到 `400` 並關閉連線。FastCGI HEAD 沒有本文、過大參數得到 `431`、損壞本文中止回應。 |
| 生命週期 | HTTP、管理或 H3 UDP 連接埠被佔用時停止啟動。SIGTERM 在 `grace_period` 內排空。重啟仍有連線空窗，政策變更優先重載。 |

[已知發行缺陷](/zh-TW/project/status/#-020-的已知缺陷)仍然適用。內建代理錯誤產生的 `502` 或 `504` 帶有 `Proxy-Status`，自訂 `handle_errors` 回應不帶此欄位。未能重用 keepalive 的日誌等級由 `ERROR` 改為 `DEBUG`。

## 📦 保留原有安裝

升級前備份設定、目前的二進位檔與整個 TLS 儲存區，保留擁有者資訊，並保護含私密金鑰的備份。安裝程式保留 `/etc/Pingclair/Pingclairfile`、`/var/lib/pingclair/.local/share/pingclair` 的憑證儲存區及網站檔案；替換二進位檔、範例設定與 systemd unit，然後重啟服務。設定中的 `storage file_system` 路徑優先於慣用儲存位置。

保留舊儲存區備份以便回復。信任新根憑證不會讓舊用戶端自動信任它，只回復二進位檔也不會還原舊根憑證或設定結構。

## 🛡️ 切換前先檢查

使用尚未替換上線版本的**新**二進位檔對正式設定執行 `validate`。它不開啟監聽器，但執行者必須讀得到設定所列的每個憑證與金鑰。再於測試部署檢查受影響路由、大小寫變體、轉送用戶端身分、錯誤頁、上傳、壓縮與指標。

`main` 原始碼建置回報 `v0.0.0-dev+<sha>`，沒有 checkout 時為 `v0.0.0-dev`；發行版回報自己的標記，例如 `v0.2.0`。安裝時檢查標記與發布的校驗值。dev 版本字串不代表已安裝穩定版。

## ⬆️ 安裝穩定版

0.2.0 發布後，安裝程式會選擇穩定版通道：

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
pingclair version
pc service status
```

本次更新依候選原始碼與本機二進位檔檢查；尚未重跑公開的 0.2.0 安裝程式、Ubuntu／Fedora 服務升級、公開憑證簽發或容器拉取。確認安裝標記與自己的路由後，才算完成升級。

安裝程式沒有指定版本的旗標。容器請固定目標標記：

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0
```

```bash
docker compose pull
docker compose up -d
docker compose logs pingclair
```

保留設定與 TLS 儲存區的 volumes。`latest` 跟隨穩定版，alpha 預覽不會推進它。啟動前必須釋出主機連接埠。

## ⏪ 回復舊版

停止新服務，還原備份的二進位檔、設定與 TLS 儲存區及其擁有者，使用還原的二進位檔驗證後再啟動。0.2.0 寫出的設定可能無法由舊版本載入。不要以不完整備份覆寫執行中的憑證儲存區。

## 🧹 移除安裝

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

這些命令保留 `/etc/Pingclair`、`/var/lib/pingclair` 與 `/var/log/pingclair`，包括憑證與網站檔案。只有確定不再需要重新安裝或回復時，才刪除保留資料。

## 🧭 下一步

- [安裝](/zh-TW/start/install/)：安裝位置與前提條件。
- [以服務方式執行](/zh-TW/start/service/)：重載、重啟與日誌。
- [專案狀態](/zh-TW/project/status/)：尚存的發行限制。
