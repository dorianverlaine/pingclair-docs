---
title: 命令列
h1_emoji: '⌨️'
description: 每個 pingclair 子命令的旗標、預設值與前提條件，並已對照二進位檔本身的 --help 輸出。
---

Pingclair 是單一二進位檔。從執行伺服器到檢查設定，每一項工作都是它的子命令：

```bash
pingclair <command> [<args…>]
```

角括號代表必填的值，方括號代表選填的值，`…` 代表可以重複的值。每個命令都支援 `--help`，`pingclair help <command>` 會印出相同的內容。不帶命令執行二進位檔，會印出命令清單。

📌 本頁描述的是最新公開的發行版 **v0.2.0-rc.3**。只存在於伺服器 `main` 分支上的變動，以 **下一版** 標示。

安裝程式也會把二進位檔連結為 `pc`，所以下面每個命令都有兩個字母的簡寫：`pc validate`、`pc service reload` 等等。兩者是同一個程式：`pc` 是符號連結，不是第二個二進位檔。

## 🚩 全域旗標

| 旗標 | 作用 |
| --- | --- |
| `-v`、`--verbose` | 將這次執行的日誌層級提高到 `debug`。可以寫在命令之前或之後。與 `caddy -v` 不同，它不會印出版本。 |
| `-h`、`--help` | 印出所附加命令的說明。 |
| `-V`、`--version` | 印出版本。只能用在最上層。 |

## 🧭 命令一覽

| 命令 | 作用 |
| --- | --- |
| `run` | 在前景執行伺服器。 |
| `reload` | 透過 Admin API 套用修改後的設定，並回報伺服器對它的判定。 |
| `start` | 啟動一個脫離終端機的伺服器。 |
| `stop` | 透過 Admin API 停止執行中的伺服器。 |
| `completion` | 印出 shell 自動補全腳本。 |
| `environ` | 印出伺服器將看到的環境變數。 |
| `list-modules` | 列出編譯進這個二進位檔的模組。 |
| `build-info` | 印出建置資訊，包括工具鏈。 |
| `manpage` | 把 man page 寫入一個目錄。 |
| `storage-export` | 把憑證儲存區寫成 tar 封存檔。 |
| `storage-import` | 從該 tar 檔還原憑證儲存區。 |
| `trust` | 把內部 CA 根憑證安裝到系統信任儲存區。 |
| `untrust` | 再把它移除。 |
| `respond` | 提供固定的回應，供開發使用。 |
| `reverse-proxy` | 不用設定檔就代理到上游。 |
| `file-server` | 不用設定檔就提供一個目錄。 |
| `validate` | 編譯設定並回報它哪裡有問題。 |
| `adapt` | 印出 Pingclairfile 編譯後的 JSON 形式。 |
| `fmt` | 格式化 Pingclairfile，或顯示格式化會改變什麼。 |
| `hash-password` | 為 `basic_auth` 產生密碼雜湊。 |
| `version` | 印出版本。 |
| `service` | 控制已安裝的 systemd unit。 |

**下一版**：新增 `storage export` 與 `storage import`，作為 Caddy 對 `storage-export` 與 `storage-import` 的寫法。帶連字號的名稱仍然可以使用。

## pingclair run

以一份設定文件在前景執行伺服器。日誌輸出到標準輸出與標準錯誤，按 `Ctrl-C` 會關閉伺服器。

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 參數 | 預設值 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要載入的設定檔或目錄。 |

| 旗標 | 作用 |
| --- | --- |
| `-r`、`--resume` | 載入 Admin API 最後自動儲存的設定，而不是檔案，與 `caddy run --resume` 相同。兩者同時存在時，覆寫 `CONFIG`。 |
| `-w`、`--watch` | 每秒檢查一次設定檔的修改時間，每次變更後重新載入。供本機開發使用。 |

```bash
pingclair run --watch
```

沒有 `CONFIG`，兩個預設檔案也都不存在時，`run` 會以狀態碼 1 結束。Caddy 在這種情況下會啟動一個空的伺服器；Pingclair 則拒絕，所以在錯誤目錄下輸入的 `run` 會明顯地失敗。

若要讓伺服器在終端機關閉後繼續執行，請使用已安裝的 unit（[以服務方式執行](/zh-TW/start/service/)）。

## pingclair reload

透過 Admin API（`POST /load`）把設定檔送給執行中的伺服器。由伺服器自己回應這個請求，所以這個命令能回報檔案是否已套用。訊號做不到這一點：systemd 只能確認訊號已送達。

```bash
pingclair reload [OPTIONS]
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要套用的設定檔。 |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 位址。 |

執行中的設定必須以全域 `admin` 選項啟用 Admin API；少了它，就沒有東西可以連線。伺服器無法套用新檔案時（最常見的原因是新增或搬移了監聽器），命令會失敗，先前的設定則繼續提供服務。

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

以背景行程啟動伺服器，shell 結束後它仍會繼續執行，不需要服務管理器。

```bash
pingclair start [OPTIONS]
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要載入的設定檔。 |

這個行程會脫離終端機，輸出也會被丟棄，所以它的日誌不會保存在任何地方。在有 systemd 的主機上，已安裝的 unit 是更好的工具：它會收集日誌、失敗時重啟，也知道監聽器何時綁定完成。請見[以服務方式執行](/zh-TW/start/service/)。

## pingclair stop

以 Admin API 的 `POST /stop` 停止執行中的伺服器。與 `reload` 一樣，執行中的設定需要有 `admin` 選項。

```bash
pingclair stop [OPTIONS]
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 位址。 |

## pingclair completion

為一種 shell 印出自動補全腳本。支援的名稱就是這個參數接受的那些：`bash`、`zsh`、`fish`、`powershell`、`elvish`。

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

印出這個行程繼承的環境變數，每行一個 `NAME=value`，讓你在啟動前就能檢查 `PINGCLAIR_TLS_STORE` 這類的值。與 `caddy environ` 不同，它不會印出伺服器推算出的路徑。

```bash
pingclair environ
```

## pingclair list-modules

列出編譯進這個二進位檔的模組。`--json` 會以 JSON 印出同一份清單，供腳本使用。

**下一版**：接受 `--versions`、`--packages` 與 `-s`／`--skip-standard`，所以為 `caddy list-modules` 寫的腳本可以不經修改直接執行。

```bash
pingclair list-modules [--json]
```

## pingclair build-info

印出建置資訊：版本、目標平台，以及產生這個二進位檔的工具鏈。回報缺陷時很有用，因為它能指出確切的建置。

```bash
pingclair build-info
```

## pingclair manpage

把 man page 寫入一個必須已經存在的目錄。這個旗標是必填的，所以不會意外寫進目前的目錄。

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

把憑證儲存區寫成 tar 封存檔。儲存區是 `PINGCLAIR_TLS_STORE` 指定的那一個，否則就是執行命令的使用者的資料目錄。範例中的前綴讓 root shell 指向服務帳號的儲存區，而不是 root 自己的。`-o -` 會把封存檔寫到標準輸出。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

封存檔裡有私鑰，所以會以 `600` 權限寫入，應該放在加密的媒體上，而不是放進會送到儲存桶的備份裡。[TLS 指南](/zh-TW/guides/tls-tuning/)說明了它包含什麼，以及何時該搬移它。

## pingclair storage-import

從 `storage-export` 寫出的封存檔還原儲存區。`-i -` 會從標準輸入讀取封存檔。

**下一版**：兩個命令都接受 `-c`／`--config <file>`，該檔案中的全域 `storage file_system <path>` 選項會指定儲存區。什麼都不會還原的匯入會被拒絕。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

把內部憑證授權單位（`tls internal`）的根憑證安裝到系統信任儲存區。之後，使用該儲存區的用戶端就會接受這個憑證授權單位簽發的憑證。根憑證從 `PINGCLAIR_TLS_STORE` 指定的儲存區讀取。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

[HTTPS](/zh-TW/start/https/) 頁面說明了何時需要這麼做，以及如何確認它生效。

## pingclair untrust

從系統信任儲存區移除該根憑證。已簽發的憑證仍留在磁碟上，但用戶端不再信任它們。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

對每個請求都提供同一個固定的回應（狀態碼、標頭與本文）。它是給開發用的，也適合拿一個永遠以相同方式回應的源站來測試用戶端。

```bash
pingclair respond [OPTIONS]
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `-s`、`--status <STATUS>` | `200` | 要回傳的狀態碼。 |
| `-H`、`--header <HEADERS>` | 無 | 以 `Field: value` 表示的回應標頭。可重複。 |
| `-b`、`--body <BODY>` | 空 | 回應本文。 |
| `-l`、`--listen <LISTEN>` | 隨機的 loopback 連接埠 | 監聽位址。 |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

沒有 `--listen` 時，會選一個空閒的 loopback 連接埠並印出來，所以兩個開發用伺服器永遠不會搶同一個連接埠。

## pingclair reverse-proxy

不用設定檔，就把一個監聽器代理到一個或多個上游。`--to` 是必填的；重複使用它可以把請求分散到多個上游。[反向代理指南](/zh-TW/guides/reverse-proxy/)以設定檔的方式說明同樣的內容。

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 要監聽的位址。 |
| `--to <TO>` | 必填 | 上游位址。可重複以指定多個。 |
| `--header-up <HEADERS_UP>` | 無 | 送往上游的請求標頭，以 `Field: value` 表示。可重複。 |
| `--header-down <HEADERS_DOWN>` | 無 | 送回下游的回應標頭，以 `Field: value` 表示。可重複。 |
| `--insecure` | 關閉 | 不驗證上游的 TLS 憑證。 |
| `--internal-certs` | 關閉 | 由內部 CA 簽發這個監聽器的憑證，而不是嘗試取得公開憑證。 |
| `--disable-redirects` | 關閉 | 不建立 HTTP 轉 HTTPS 的重新導向監聽器。 |
| `-c`、`--change-host-header` | 關閉 | 把送往上游的 `Host` 標頭改寫為上游位址，與 Caddy 相同。 |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

不用設定檔，就以 HTTP 提供一個目錄。

```bash
pingclair file-server [OPTIONS]
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 要監聽的位址。 |
| `--root <ROOT>` | `.` | 要提供的目錄。 |
| `-b`、`--browse` | 關閉 | 顯示目錄列表。 |
| `-d`、`--domain <DOMAIN>` | 無 | 以 HTTPS 提供這個網域；`--listen` 必須是一個連接埠。 |
| `--access-log` | 關閉 | 每個請求寫一行存取紀錄。 |
| `--no-compress` | 關閉 | 停用回應壓縮。 |
| `--file-limit <FILE_LIMIT>` | 無 | 目錄列表最多顯示的檔案數。 |
| `--templates` | 關閉 | 把 `.html` 檔案當作模板算繪，與 Caddy 相同。 |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

壓縮、快取標頭與單頁應用程式的後備路由應該寫在設定檔中；[靜態網站指南](/zh-TW/guides/static-site/)說明了這些內容。

## pingclair validate

編譯設定並回報找到的第一個問題，不會啟動任何東西。設定被拒絕時結束碼不為零，所以這個命令可以當作部署腳本中的關卡。

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 參數 | 預設值 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要檢查的設定檔或目錄。 |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

印出 Pingclairfile 編譯後的 JSON 文件。這是 Pingclair 自己的 schema，也就是 `validate`、`run` 與 Admin API 的 `/load` 接受的格式。與 `caddy adapt` 不同，輸出不是 Caddy 的 `{"apps": …}` 形式，Caddy 也無法載入它。

`--pretty` 會為 JSON 加上縮排。`--validate` 還會執行 `validate` 做的檢查，例如憑證檔案是否存在。

**下一版**：`adapt` 在印出之前一律會驗證，所以結束碼 0 代表這個建置能載入結果。`--validate` 仍會被接受，但不會改變任何事。

```bash
pingclair adapt [OPTIONS]
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `-c`、`--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要讀取的設定檔。 |
| `-p`、`--pretty` | 關閉 | 為 JSON 加上縮排。 |
| `--validate` | 關閉 | 也執行 `validate` 做的檢查。 |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

格式化 Pingclairfile 並印出結果。沒有路徑時讀取 `./Pingclairfile`；`-` 則讀取標準輸入。

**下一版**：輸入原本沒有格式化時，`fmt` 會以狀態碼 1 結束，所以它能像 `caddy fmt` 一樣擋下 commit；`--overwrite` 仍以 0 結束。`--config <path>` 與 `-w` 作為 Caddy 的寫法被接受，縮排也從兩個空白改為每層一個 tab。

```bash
pingclair fmt [OPTIONS] [PATH]
```

| 旗標 | 作用 |
| --- | --- |
| `-o`、`--overwrite` | 把格式化後的內容寫回檔案，而不是印出來。 |
| `-d`、`--diff` | 印出視覺化的差異，而不是格式化後的檔案。 |

```bash
pingclair fmt --diff              # what would change
pingclair fmt --overwrite         # apply it
```

## pingclair hash-password

為 `basic_auth` 指令產生密碼雜湊。省略 `--plaintext` 時，密碼從標準輸入讀取，這樣它就不會留在 shell 歷史紀錄中。

```bash
pingclair hash-password [OPTIONS]
```

| 旗標 | 預設值 | 作用 |
| --- | --- | --- |
| `-p`、`--plaintext <PLAINTEXT>` | 從標準輸入讀取 | 要雜湊的密碼。 |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` 或 `argon2id`。 |
| `--bcrypt-cost <COST>` | `14` | bcrypt 成本，4 到 31。越高越慢，也越強。 |
| `--argon2id-time <TIME>` | `1` | argon2id 迭代次數。 |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id 記憶體成本，單位為 KiB。 |
| `--argon2id-threads <THREADS>` | `4` | argon2id 平行度。 |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id 輸出長度，單位為位元組。 |

```bash
pingclair hash-password --algorithm argon2id
```

把輸出貼進指令中；[`basic_auth` 條目](/zh-TW/reference/directives/#basic_auth)示範了周圍的語法。

## pingclair version

印出版本，例如 release candidate 會印出 `v0.2.0-rc.3`。

```bash
pingclair version
```

## pingclair service

控制安裝程式寫入的 systemd unit。它包裝了 `systemctl`，所以兩者都能用；這個子命令讓 unit 的命令和其他命令放在一起。

```bash
pingclair service <start|stop|restart|reload|status>
```

| 子命令 | 作用 |
| --- | --- |
| `start` | 啟動 unit。 |
| `stop` | 停止 unit。 |
| `restart` | 重啟 unit，監聽器變更或全行程層級的選項變更都需要這麼做。 |
| `reload` | 以訊號請執行中的伺服器重新讀取設定檔。結果出現在 unit 的狀態列與 journal 中，而不是這個命令的結束碼。 |
| `status` | 印出 unit 的狀態。 |

它只能在有 systemd 的 Linux 上運作；在其他平台上會拒絕執行。unit 本身的說明請見[以服務方式執行](/zh-TW/start/service/)。

## 🧾 這些選項從哪裡來

命令列定義在伺服器原始碼的單一檔案 `pingclair/src/cli/mod.rs` 中，本頁依照它的順序編排。那裡的命令旗標一改，本頁也會跟著改。
