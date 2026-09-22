---
title: サービスとして動かす
h1_emoji: '🔁'
sidebar:
  order: 4
description: 導入された systemd ユニットが何をするか、起動・停止・再読み込みの方法、ログの場所、そして設定が壊れたときに外からどう見えるかを説明します。
---

インストーラは `systemd` ユニットを有効にして起動したままにします。このページは
そのユニットを順に読み、操作方法を示し、二つの失敗の形を外から見たままに説明
します。起動しないサーバーと、起動中のサーバーが設定を拒否する場合です。

## 🧾 ユニットがすること

```bash
systemctl cat pingclair
```

重要なキーは次のとおりです。

```text
[Service]
Type=notify
NotifyAccess=main
User=pingclair
Group=pingclair
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment="RUST_LOG=info"
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -USR1 $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=on-failure
RestartPreventExitStatus=1
RestartSec=5s
LimitNOFILE=1048576
LimitNPROC=512
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true
```

順に読みます。

- `Type=notify` と `NotifyAccess=main`: サーバーはリスナーのバインドが終わった
  時点で `systemd` に伝えます。したがって `systemctl start` はプロセスの存在
  ではなく、プロキシが応答できるまで待ちます。
- `User=pingclair` と `AmbientCapabilities=CAP_NET_BIND_SERVICE`: サーバーは
  非特権で動きながら 80 と 443 にバインドできます。
- `PINGCLAIR_TLS_STORE` は意図的に置いていません。サービスアカウントのホームは
  `/var/lib/pingclair` なので、証明書は `/var/lib/pingclair/.local/share/pingclair`
  にあります——バイナリ自身の既定で、インストーラが作成・移行するディレクトリで、
  `pingclair environ` が印字するパスです。ここでストアを名指しすれば、すでに
  一つの答えがある問いに二つ目の答えを与えることになります。
- `ExecStartPre` で `validate` を走らせることは意図的にしていません。安全な検査
  場所に見えますが、それが罠です。`systemd` が `RestartPreventExitStatus=` を
  適用するのは主プロセスであって、失敗した事前コマンドではありません。そのため
  コンパイラが拒否する設定は、ユニットを failed のまま残す代わりに 5 秒ごとに
  再試行されていました。サーバー自身が何かをバインドする前にファイルを
  コンパイルし、拒否するときは終了コード 1 で終わります。それが上の再起動
  ポリシーが書かれた理由の終了コードで、`pingclair run` はそのプロセスになる
  ために存在します。
- `ExecReload` は `SIGUSR1` を送ります。これはサーバーが「ファイルを読み直せ」と
  解釈する信号です。`SIGHUP` は意図的に無視され、それを送っていたユニットは
  古い設定が動き続けたまま成功を報告していました
  （[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。
  `systemd` が観測できるのは `kill` の終了だけなので、サーバーはファイルをどう
  扱ったかをユニットの status line に載せます——`Serving (reloaded 1
  listener(s) in 323.341µs)`、あるいは `Reload rejected: …`——そして
  `systemctl status` がそれを表示します。詳しくは下の
  [再読み込みの節](#-再読み込みの意味)にあります。
- `Restart=on-failure` と `RestartPreventExitStatus=1`、`RestartSec=5s`: 終了
  コード 1 は設定もしくは証明書ストアがそもそも使えなかったことを意味するので、
  5 秒ごとに再試行せず、ユニットは運用者が見るために `failed` のまま残ります。
  それ以外の失敗は再起動されます。
- `ProtectSystem=full`、`PrivateTmp`、`NoNewPrivileges`、`LimitNPROC`、
  `LimitNOFILE`: サーバーは必要なファイルシステムの見え方とプロセス上限だけを
  受け取り、それ以上は受け取りません。

どちらの導入経路も同じファイルを書きます。一行インストールは
`scripts/pingclair.service` のバイト単位のコピーを埋め込んでおり——`just
repo-lint` は両者がずれれば失敗します——`curl | bash` の新規導入とリポジトリ
からの導入は同じユニットを生み、
`systemd-analyze verify /etc/systemd/system/pingclair.service` はどちらの経路でも
このユニットについて何も報告しません。

## 🎛️ サービスの操作

`pc service` はこのユニットに対する `systemctl` のラッパーなので、どちらでも
同じです。

| 目的 | `pc` の場合 | `systemctl` の場合 |
| --- | --- | --- |
| 起動 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 設定の再読み込み | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| リスナーやプロセス全体の変更後の再起動 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 状態 | `pc service status` | `systemctl status pingclair` |
| ログを追う | — | `journalctl -u pingclair -f` |

`pc service status` はサーバーが送った準備完了行を含め、ユニット自身の見方を
表示します。

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
       Docs: https://pingclair.com/start/service/
   Main PID: 1808 (pingclair)
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

## 🔁 再読み込みの意味

編集した `/etc/Pingclair/Pingclairfile` は一つの信号で実行中のサーバーに届き、
二つのコマンドがその信号を送ります。

`SIGUSR1` が再読み込みの信号で、追加の設定は不要です。

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload` —— 同じ呼び出しである `sudo systemctl reload pingclair` も
—— がその信号を代わりに送ります。ユニットの `ExecReload` は
`/bin/kill -USR1 $MAINPID` で、明らかな命令が動く命令になりました。`SIGHUP` を
送っていたユニットは成功を報告して何も適用しませんでした。それが
[issue #66](https://github.com/dorianverlaine/pingclair/issues/66) に記録されて
います。

`pingclair reload` は Admin API 経由で同じコードに到達し、サーバーがファイルを
どう見たかを報告します。グローバルオプションの `admin` が必要です。

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` が報告できるのは一つだけです。`kill` が信号を届けたこと。
サーバーはそのあとにファイルを読むので、その判断はユニットの status line と
ジャーナルに出ます。`pc service reload` は設定が適用されたと主張する代わりに、
そう伝えます。

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

実行中のサーバーがファイルの要求どおりに適用できないときは、以前の設定が
サービスのまま残り、status line はどの変更が拒否されたかを示します。サイトを
`:80` から `:8080` へ移すのが典型的な例です。リスナーの構成は起動時にソケットと
一緒に作り直されるためです。

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

どの経路でも、コンパイルできない設定は以前の設定を動かしたままにします。
先に検証します。

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

例外はプロセス全体に関わるポリシーです。`trusted_proxies` のような起動時に
確立されるオプションは、再起動後にしか効きません: `sudo pc service restart`。
リスナーを追加・移動する設定も同じように拒否されます——status line が追加・削除
されたアドレスを示します——再読み込みが適用するのはポリシーであり、新しい
待ち受けソケットではないからです。

## 📜 ログ

ユニットは `RUST_LOG=info` を設定し、すべてを journal に送ります。

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

起動、再読み込み、証明書の処理、そしてリクエストごとのアクセス行がそこに
現れます。

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 📋 Step 1/3: Validating configuration...
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

サーバーが拒否した再読み込みも同じように、理由と「何も変わっていない」ことと
ともに記録されます。

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

自前のログをローテーション付きで欲しい場合は `log` シンクを設定し、
インストーラが作成してサービスユーザーに与える `/var/log/pingclair` の下に
書き出します。

## ⚠️ サービスが立ち上がらないとき

- **`is-active` が `activating` のままで `NRestarts` が増え続ける。** 導入された
  これは古いユニットで引退した挙動です。`RestartPreventExitStatus` を伴わない
  `Restart=always` を積んでいたため、サーバーが拒否する設定は 5 秒ごとに再試行
  され、「一度失敗したユニット」ではなく「いつまでも落ち着かないユニット」に
  見えていました。原因はもう一つあります。`validate` を `ExecStartPre` として
  走らせていたことで、`RestartPreventExitStatus` はそれを覆いません。導入される
  ユニットは `Restart=on-failure` + `RestartPreventExitStatus=1` を積み、
  事前コマンドを持ちません。拒否された起動は `is-active` を `failed` のまま、
  `NRestarts` をゼロのままにします。古い導入では、デバッグの前にループを
  止めます: `sudo systemctl stop pingclair`、ファイルを直し、
  `sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。** サーバーが何かをバインドする前に設定を拒否しており、
  コンパイラの理由が journal にあります。例:
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`。**
  ストアはサービスアカウントのものです。`sudo ls -ld /var/lib/pingclair/.local/share/pingclair`
  を確認し、所有者が `pingclair` であることを確かめます。
- **`systemd-analyze verify` が導入済みユニットについて
  `Missing '=', ignoring line` を出す。** 古いワンライナー導入は、コメントが
  シェルに展開されたユニットを書いていました——`--help` の出力 25 行で、
  `systemd` はそれを無視します。現在のインストーラで再導入するとユニットは
  そのまま書かれ、この報告は消えます。
- **ユニットは動いているのに何も応答しない。** リスナーはバインド済みで要求が
  届いていません。[インストール](/ja/start/install/) と同じく、まずプロバイダの
  ファイアウォール、次にホスト側を確認します。

## 🧭 次の手順

- [アップグレードと削除](/ja/start/upgrade/): 再実行が何を保つか、そして全部
  取り除く方法。
- [HTTPS](/ja/start/https/): 証明書、ストアの場所、そして `pingclair trust` に
  `PINGCLAIR_TLS_STORE` が必要な理由。
- [`log`](/ja/reference/directives/#log): このページが journal から読んでいる
  アクセスログの出力先。
