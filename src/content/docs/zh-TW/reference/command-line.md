---
title: 命令列
h1_emoji: '⌨️'
description: 二進位檔公開的每個子指令，連同旗標、預設值與前置條件，都對照 `pingclair --help` 核對過。
---

Pingclair 以單一二進位檔發佈，命令列遵循 Unix 的慣例：

```bash
pingclair <command> [<args…>]
```

尖括號是必填，方括號是選填，`…` 代表可以重複。每個指令的 `--help` 回傳的就是寫這
一頁所用的同一份文字，`pingclair help <command>` 印出的也是它。不帶指令執行會列出
全部指令。

安裝程式還把二進位檔連結為 `pc`，所以下面每條指令都有兩個字母的寫法：`pc validate`、
`pc service reload` 等等。兩者是同一個程式，`pc` 是符號連結，不是第二個二進位檔。

## 🚩 全域旗標

| 旗標 | 作用 |
| --- | --- |
| `-v`, `--verbose` | 把這次執行的日誌等級提到 `debug`。放在指令前後都可以。 |
| `-h`, `--help` | 印出它所附著的那個指令的說明。 |
| `-V`, `--version` | 印出版本。僅限最上層。 |

## 🧭 指令一覽

| 指令 | 作用 |
| --- | --- |
| `run` | 在前景執行伺服器。 |
| `reload` | 透過 Admin API 套用改過的設定，並回報伺服器對它的判斷。 |
| `start` | 啟動一份脫離終端機的伺服器副本。 |
| `stop` | 透過 Admin API 停止正在執行的伺服器。 |
| `completion` | 印出某個 shell 的補完指令稿。 |
| `environ` | 印出伺服器將看到的環境。 |
| `list-modules` | 列出編譯進這個二進位檔的模組。 |
| `build-info` | 印出建置資訊，包括工具鏈。 |
| `manpage` | 把 man 手冊寫進一個目錄。 |
| `storage-export` | 把憑證儲存區放進一個 tar 封存檔。 |
| `storage-import` | 從該封存檔還原憑證儲存區。 |
| `trust` | 把內部 CA 根憑證裝進系統信任儲存區。 |
| `untrust` | 再把它移除。 |
| `respond` | 開發時回傳固定回應。 |
| `reverse-proxy` | 不寫設定檔就代理到上游。 |
| `file-server` | 不寫設定檔就提供目錄。 |
| `validate` | 編譯設定並說明哪裡不對。 |
| `adapt` | 印出 Pingclairfile 編譯出的 JSON。 |
| `fmt` | 格式化 Pingclairfile，或顯示格式化會改動什麼。 |
| `hash-password` | 為 `basic_auth` 產生密碼雜湊。 |
| `version` | 印出版本。 |
| `service` | 操作安裝出來的 systemd unit。 |

## pingclair run

用一份設定文件在前景執行伺服器。日誌走標準輸出與標準錯誤，`Ctrl-C` 停止伺服器。

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 引數 | 預設 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要載入的設定檔或目錄。 |

| 旗標 | 作用 |
| --- | --- |
| `-r`, `--resume` | 像 `caddy run --resume` 那樣，載入 Admin API 最後一次自動儲存的設定。兩者同時存在時覆蓋 `CONFIG`。 |
| `-w`, `--watch` | 監視設定檔（每秒輪詢 mtime），每次改動後送重載訊號給行程。面向本機開發：被拒絕的編輯很快就能看見。 |

```bash
pingclair run --watch
```

要讓伺服器活過終端機，請用安裝出來的 unit（[以服務方式執行](/zh-TW/start/service/)）
或[快速開始](/zh-TW/start/quickstart/)，後者把同一條指令按服務的方式講一遍。

## pingclair reload

透過 Admin API 把改過的設定套用到正在執行的伺服器。回應請求的是伺服器本身，所以
這條指令會回報它對檔案的判斷——訊號做不到這一點，systemd 只能確認訊號已送達。

```bash
pingclair reload [OPTIONS]
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要套用的設定檔。 |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 位址。 |

Admin API 必須開著：全域選項 `admin` 啟用它，而沒有該選項的設定沒有任何端點可達。
正在執行的伺服器無法套用的重載——改動監聽器拓撲是最常見的情形——會讓舊設定繼續
服務。

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

啟動一份在 shell 結束後仍繼續執行的伺服器副本，不涉及服務管理器。

```bash
pingclair start [OPTIONS]
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要載入的設定檔。 |

行程會脫離終端機，輸出被丟棄，因此任何地方都沒有日誌。在有 systemd 的主機上，安裝
出來的 unit 是更好的工具：它捕捉日誌、失敗時重啟，並且知道監聽器何時綁定完成。
見[以服務方式執行](/zh-TW/start/service/)。

## pingclair stop

透過 Admin API 停止正在執行的伺服器——就是 Admin API 公開的 `POST /stop`。和
`reload` 一樣需要 `admin` 選項。

```bash
pingclair stop [OPTIONS]
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 位址。 |

## pingclair completion

印出某個 shell 的補完指令稿。可接受的名字與引數接受的完全一致：`bash`、`zsh`、
`fish`、`powershell`、`elvish`。

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

印出伺服器將要執行的環境，這樣 `PINGCLAIR_TLS_STORE` 之類的值可以在啟動前確認，
而不是在啟動後從失敗裡反推。

```bash
pingclair environ
```

## pingclair list-modules

列出編譯進這個二進位檔的模組與功能。`--json` 把同一份清單輸出成結構化形式，供
指令稿使用。

```bash
pingclair list-modules [--json]
```

## pingclair build-info

印出建置資訊：版本、目標，以及產出這個二進位檔的工具鏈。回報缺陷時有用，因為它
指明了確切的建置。

```bash
pingclair build-info
```

## pingclair manpage

把 man 手冊寫進一個必須已存在的目錄。該旗標是必填的，所以不會意外寫進目前目錄。

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

把 `PINGCLAIR_TLS_STORE` 指定的憑證儲存區寫進 tar 封存檔。輸出路徑寫 `-` 則寫到
標準輸出。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-export -o /tmp/store.tar
```

封存檔裡有私密金鑰，所以它以 `600` 權限寫入，並且該放在加密媒體上，而不是隨備份
進 bucket。[TLS 指南](/zh-TW/guides/tls-tuning/) 說明了它裝了什麼、什麼時候該搬。

## pingclair storage-import

從 `storage-export` 寫出的封存檔還原儲存區。`-` 表示從標準輸入讀封存檔。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

把內部 CA 根憑證裝進系統信任儲存區，此後瀏覽器與命令列用戶端都會接受該 CA 簽發的
憑證。CA 從 `PINGCLAIR_TLS_STORE` 指定的儲存區讀取。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust
```

什麼時候需要它、怎麼確認生效，見 [HTTPS](/zh-TW/start/https/)。

## pingclair untrust

再把這個根憑證從系統信任儲存區移除。已經簽發的憑證檔案還在，用戶端不再信任它們。

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair untrust
```

## pingclair respond

回傳一個固定回應——狀態、標頭、主體——用於開發和對著一個永遠同樣應答的上游測試
用戶端。

```bash
pingclair respond [OPTIONS]
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | 要回傳的狀態碼。 |
| `-H`, `--header <HEADERS>` | 無 | `Field: value` 形式的回應標頭。可重複。 |
| `-b`, `--body <BODY>` | 空 | 回應主體。 |
| `-l`, `--listen <LISTEN>` | 隨機回送埠 | 監聽位址。 |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

不給 `--listen` 時埠由工具挑選並印出來，這樣兩個開發伺服器不會搶同一個固定連接埠。

## pingclair reverse-proxy

不寫設定檔，直接從監聽位址代理到一個或多個上游。這是
[反向代理指南](/zh-TW/guides/reverse-proxy/)的一行版本，提供的是正式環境形態的
設定而不是玩具：上游是必填的，多個 `--to` 會做負載平衡。

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 監聽位址。 |
| `--to <TO>` | 必填 | 上游位址。可重複指定多個。 |
| `--header-up <HEADERS_UP>` | 無 | 送往上游的請求標頭（`Field: value`）。可重複。 |
| `--header-down <HEADERS_DOWN>` | 無 | 送往下的回應標頭（`Field: value`）。可重複。 |
| `--insecure` | 關 | 上游憑證不符時略過 TLS 驗證。 |
| `--internal-certs` | 關 | 這個監聽器的憑證由內部 CA 簽發，而不去申請公開憑證。 |
| `--disable-redirects` | 關 | 不準備 HTTP 到 HTTPS 的重新導向監聽器。 |
| `-c`, `--change-host-header` | 關 | 像 Caddy 那樣，把上游的 `Host` 標頭改寫成上游位址。 |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

不寫設定檔，直接把目錄用 HTTP 提供出去。

```bash
pingclair file-server [OPTIONS]
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 監聽位址。 |
| `--root <ROOT>` | `.` | 要提供的目錄。 |
| `-b`, `--browse` | 關 | 顯示目錄列表。 |
| `-d`, `--domain <DOMAIN>` | 無 | 用 HTTPS 提供這個網域；要求 `--listen` 是連接埠。 |
| `--access-log` | 關 | 每個請求寫一行存取日誌。 |
| `--no-compress` | 關 | 關閉回應壓縮。 |
| `--file-limit <FILE_LIMIT>` | 無 | 目錄列表裡顯示的檔案數上限。 |
| `--templates` | 關 | 像 Caddy 那樣把 `.html` 當模板渲染。 |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

壓縮、快取標頭與單頁應用程式回退屬於設定檔，
[靜態站台指南](/zh-TW/guides/static-site/)講了這些。

## pingclair validate

編譯設定並報出第一個問題，什麼都不啟動。設定被拒絕時結束碼非零，所以它能用在
管線或部署指令稿裡。

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 引數 | 預設 | 作用 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`，其次 `./Caddyfile` | 要檢查的設定檔或目錄。 |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

印出設定編譯出的 JSON 形式。`--pretty` 縮排便於閱讀，`--validate` 會連需要動檔案
系統的檢查——例如憑證路徑——一起跑，而不只是語法。

```bash
pingclair adapt [OPTIONS]
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`，其次 `./Caddyfile` | 要讀取的設定檔。 |
| `-p`, `--pretty` | 關 | 縮排 JSON。 |
| `--validate` | 關 | 同時驗證轉換後文件引用的東西。 |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

格式化 Pingclairfile 並印出結果。不給路徑時讀 `./Pingclairfile`，`-` 讀標準輸入。

```bash
pingclair fmt [OPTIONS] [PATH]
```

| 旗標 | 作用 |
| --- | --- |
| `-o`, `--overwrite` | 把格式化後的文字寫回檔案，而不是印出。 |
| `-d`, `--diff` | 印出視覺化差異，而不是格式化後的檔案。 |

```bash
pingclair fmt --diff              # 會改什麼
pingclair fmt --overwrite         # 套用它
```

## pingclair hash-password

為 `basic_auth` 指令產生密碼雜湊。省略 `--plaintext` 時從標準輸入讀密碼，這樣它
不會留在 shell 歷史裡。

```bash
pingclair hash-password [OPTIONS]
```

| 旗標 | 預設 | 作用 |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | 從標準輸入讀 | 要雜湊的密碼。 |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` 或 `argon2id`。 |
| `--bcrypt-cost <COST>` | `14` | bcrypt 代價，4 到 31。越高越慢也越強。 |
| `--argon2id-time <TIME>` | `1` | argon2id 迭代次數。 |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id 記憶體代價，單位 KiB。 |
| `--argon2id-threads <THREADS>` | `4` | argon2id 平行度。 |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id 輸出長度，單位位元組。 |

```bash
pingclair hash-password --algorithm argon2id
```

把輸出貼進指令裡；周邊語法見
[`basic_auth`](/zh-TW/reference/directives/#basic_auth)。

## pingclair version

印出版本，發佈候選會像 `v0.2.0-rc.3`。

```bash
pingclair version
```

## pingclair service

管理安裝程式寫出的 systemd unit。它包裝 `systemctl`，兩者可以互換；存在的意義是讓
操作 unit 的指令和其餘指令待在同一處。

```bash
pingclair service <start|stop|restart|reload|status>
```

| 子指令 | 作用 |
| --- | --- |
| `start` | 啟動 unit。 |
| `stop` | 停止 unit。 |
| `restart` | 重啟 unit，改動監聽器或行程級選項後需要它。 |
| `reload` | 用訊號請正在執行的伺服器重新讀取設定檔。結果在 unit 的 status line 與日誌裡，不在這條指令的結束碼裡。 |
| `status` | 印出 unit 狀態。 |

僅限帶 systemd 的 Linux。其他平台這條指令會直接拒絕而不是假裝可以；unit 本身的
說明在[以服務方式執行](/zh-TW/start/service/)。

## 🧾 這些選項的出處

命令列定義在伺服器原始碼的一個檔案裡，`pingclair/src/cli/mod.rs`，上面的頁面按它的
順序排列。每個 `--help` 畫面顯示的版本與本頁核對所用的版本是同一個；指令的旗標
變了，這一頁也跟著變。
