---
title: 快速開始
description: 寫出第一份 Pingclairfile，驗證設定，然後開始服務流量。
---

本頁從一份全新安裝走到可運作的伺服器：先讓 8080 埠供應靜態網站，再放上一個反向代理。

## 1. ✍️ 寫一份設定

建立名為 `Pingclairfile` 的檔案：

```caddyfile
localhost:8080 {
    file_server ./public
}
```

檔案裡只有一個 site block。`localhost:8080` 是這個 site 回應的位址，`file_server` 負責供應檔案，`./public` 是檔案的來源目錄，相對於執行時的工作目錄。

## 2. ✅ 驗證設定

```bash
pingclair validate
```

`validate` 預設讀取 `./Pingclairfile`，也會偵測 `./Caddyfile`。它會編譯設定、檢查憑證路徑之類的語意條件，並在有問題時以非零狀態結束。驗證不是建議：驗證失敗的設定不會執行。

撰寫設定時，另外兩個指令很有用：

```bash
pingclair adapt --pretty   # 印出編譯後的 JSON 形式
pingclair fmt --diff       # 顯示格式差異，但不寫回檔案
```

## 3. 🚀 執行

```bash
pingclair run Pingclairfile
```

行程會記錄每個開啟的 listener，接著持續服務請求，直到收到終止訊號。

## 4. 🔍 驗證結果

另開一個終端機：

```bash
curl -i http://localhost:8080/
```

預期會看到 `200`，以及所供應檔案的 `ETag` 與 `Last-Modified` 標頭。

如果請求反而卡住，請檢查是否有系統代理攔截了 loopback 流量，並改用 `curl --noproxy '*'` 重試。

## 5. 🔁 代理一個應用

把 site block 換成指向 3000 埠後端服務的反向代理：

```caddyfile
localhost:8080 {
    reverse_proxy localhost:3000
}
```

用同樣的指令重新驗證與執行。回應現在來自後端。多個上游、負載平衡策略、健康檢查與失敗行為，請見 [`reverse_proxy`](/zh-TW/reference/directives/#reverse_proxy)。

## 6. 🔒 終止 TLS

公開網域名稱會自動取得憑證：

```caddyfile
{
    email admin@example.com
}

example.com {
    reverse_proxy localhost:3000
}
```

自動 HTTPS 需要 site 位址是公開名稱，且 ACME 挑戰能連到伺服器，通常代表需要 80 埠。若是私有來源，改用 `tls internal` 由本機憑證授權單位簽發；用戶端必須信任其根憑證，位置在 `$PINGCLAIR_TLS_STORE/internal/root.crt`。

## 7. ⚙️ 以服務方式執行

安裝腳本會建立 `systemd` unit，並由 `pc` 指令管理：

```bash
pc service start
pc service status
pc service reload   # 重新讀取設定，不重啟行程
```

## 🧭 下一步

- [設定模型](/zh-TW/concepts/configuration/)
- [架構](/zh-TW/concepts/architecture/)
- [指令參考](/zh-TW/reference/directives/)
