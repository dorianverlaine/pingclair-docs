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
Environment="PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs"
ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -HUP $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=always
RestartSec=5s
LimitNOFILE=1048576
```

順に読みます。

- `Type=notify` と `NotifyAccess=main`: サーバーはリスナーのバインドが終わった
  時点で `systemd` に伝えます。したがって `systemctl start` はプロセスの存在
  ではなく、プロキシが応答できるまで待ちます。
- `User=pingclair` と `AmbientCapabilities=CAP_NET_BIND_SERVICE`: サーバーは
  非特権で動きながら 80 と 443 にバインドできます。
- `PINGCLAIR_TLS_STORE`: 証明書は `/var/lib/pingclair/certs` に置かれます。
  サービスアカウントにはホームディレクトリが無いため、バイナリの既定に任せると
  存在しない `$HOME` を指してしまいます。
- `ExecStartPre` は起動のたびに `validate` を実行します。コンパイルできない設定は
  サーバーに届きません。
- `ExecReload` は `SIGHUP` を送りますが、サーバーはそれを無視します。したがって
  `systemctl reload` — それを包む `pc service reload` も — は成功を報告して何も
  変えません（[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。
  再読み込みする信号は `SIGUSR1` です。
- `Restart=always` と `RestartSec=5s`: 起動に失敗すると 5 秒ごとに再試行します。
  これが人を驚かせる設定なので、失敗の形を以下に書きます。

⚠️ `curl | bash` の導入はユニットの縮小コピーを書き込みます。リポジトリの
`scripts/pingclair.service` はさらに強化（`ProtectSystem=full`、`PrivateTmp`、
`NoNewPrivileges`、`LimitNPROC`）と別の再起動ポリシー
（`Restart=on-failure` と `RestartPreventExitStatus=1`）を加えます。より厳しい
ユニットを使うには次のようにします。

```bash
git clone https://github.com/dorianverlaine/pingclair
sudo cp pingclair/scripts/pingclair.service /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo systemctl restart pingclair
```

## 🎛️ サービスの操作

`pc service` はこのユニットに対する `systemctl` のラッパーなので、どちらでも
同じです。

| 目的 | `pc` の場合 | `systemctl` の場合 |
| --- | --- | --- |
| 起動 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 停止 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 再起動 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 設定の再読み込み | — | `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` |
| インストール済みの再読み込み（何もしない） | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 状態 | `pc service status` | `systemctl status pingclair` |
| ログを追う | — | `journalctl -u pingclair -f` |

`pc service status` はサーバーが送った準備完了行を含め、ユニット自身の見方を
表示します。

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
    Process: 1805 ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile (code=exited, status=0/SUCCESS)
   Main PID: 1808 (pingclair)
     Status: "Serving"
```

## 🔁 再読み込みの意味

編集した設定を反映するコマンドは二つあり、それらしく見える三つ目は何もしません。

`SIGUSR1` が再読み込みの信号です。追加の設定は不要です。

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pingclair reload` は Admin API 経由で同じコードに到達し、サーバーがファイルを
どう見たかを報告します。グローバルオプションの `admin` が必要です。

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`pc service reload` は明らかな命令に見えますが、何もしないのはこちらです。
インストールされたユニットの `ExecReload` は `SIGHUP` を送り、サーバーはその信号を
無視するため、コマンドは成功を報告しながら古い設定が動き続けます。このユニットで
実測: `x-version: four` が稼働中でファイルに `five` を書いた状態で
`pc service reload` は `✅ Service reloaded successfully` と答え、ヘッダーは
`four` のまま。同じ変更を `SIGUSR1` か `pingclair reload` で適用すると即座に
反映されました
（[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)）。

どの経路でも、コンパイルできない設定は以前の設定を動かしたままにし、サーバーは
その拒否をログに残しません。先に検証します。

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

例外はプロセス全体に関わるポリシーです。`trusted_proxies` のような起動時に
確立されるオプションは、再起動後にしか効きません: `sudo pc service restart`。
リスナーを追加・移動する設定も再起動が必要です。再読み込みが適用するのは
ポリシーであり、新しい待ち受けソケットではありません。

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
INFO pingclair_proxy::server: ♻️ Configuration reloaded successfully
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

自前のログをローテーション付きで欲しい場合は `log` シンクを設定し、
インストーラが作成してサービスユーザーに与える `/var/log/pingclair` の下に
書き出します。

## ⚠️ サービスが立ち上がらないとき

- **`is-active` が `activating` のままで `NRestarts` が増え続ける。** 導入された
  再起動ポリシーが働いています。`Restart=always` は 5 秒ごとに再試行するため、
  壊れた設定は「一度失敗したユニット」ではなく「いつまでも落ち着かないユニット」
  に見えます。デバッグの前にループを止めます: `sudo systemctl stop pingclair`、
  ファイルを直し、`sudo systemctl reset-failed pingclair`。
- **`Job for pingclair.service failed because the control process exited with
  error code`。** `ExecStartPre` が設定を拒否しており、コンパイラの理由が
  journal にあります。例:
  `Error: ❌ Configuration Error: Compile error: Unsupported feature: 'encode br': Brotli is not implemented for proxied responses; use 'encode zstd gzip'`。
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`。**
  ストアはサービスアカウントのものです。`sudo ls -ld /var/lib/pingclair/certs`
  を確認し、所有者が `pingclair` であることを確かめます。
- **`systemd-analyze verify` が導入済みユニットについて
  `Missing '=', ignoring line` を出す。** ワンライナー導入が書く縮小コピーには
  シェル置換由来の余分な行が混じっており、`systemd` はそれを無視します。
  リポジトリの `scripts/pingclair.service` を導入すると消えます。
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
