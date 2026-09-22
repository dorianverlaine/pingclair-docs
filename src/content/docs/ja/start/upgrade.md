---
title: アップグレードと削除
h1_emoji: '🧹'
sidebar:
  order: 5
description: インストーラの再実行でアップグレードし、コンテナのタグを固定し、古いリリースに戻し、残す価値のあるものを失わずに全部取り除きます。
---

アップグレードが置き換えるのは二つ — バイナリとサービスユニット — だけで、設定
と証明書には触れません。このページはそれを示し、コンテナでの同等の手順、版を
戻す必要があるときの手順、そして撤去を扱います。

## 🧾 何が何に耐えるか

| パス | アップグレード時 |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | 保持。インストーラは無いときだけ書きます。 |
| `/etc/Pingclair/Pingclairfile.example` | 現在の例に置き換わります。 |
| `/var/lib/pingclair/certs` | 保持。発行済み証明書と ACME の状態はそのままです。 |
| `/var/lib/pingclair/html` | 保持。 |
| `/usr/local/bin/pingclair` と `pc` | 新しいリリースに置き換わります。 |
| `/etc/systemd/system/pingclair.service` | 書き直され、サービスが再起動します。 |

## ⬆️ インストーラでアップグレードする

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

スクリプトは GitHub に最新リリースのタグを問い合わせ、表示し、アーカイブの
SHA-256 を検証し、バイナリとユニットを置き換えてサービスを再起動します。既存の
設定ファイルには触れません。だからこれが初期化ではなくアップグレードになり
ます。

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

新しい版と、以前の設定がまだ配信されていることを確認します。

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

インストーラは常に最新リリースを導入します。特定の版を指定するオプションは
ありません。それが必要なときは下のロールバックを使います。

## 🐳 コンテナをアップグレードする

ホストには何も導入されていないので、アップグレードはタグの変更と pull です。
compose ファイルで新しいリリースを固定します。

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

設定と証明書ストアはボリュームの中にあるので、新しいコンテナは前のコンテナが
残した場所でそれらを見つけます。注意点が二つあります。

- **80 ポートを公開するコンテナは、systemd のサービスが動いている間は起動
  できません。** どちらかを止めます: `sudo pc service stop`、またはコンテナ側の
  公開ポートを変えます。
- **`latest` は最新リリースを追いかけます。** 本番では版を固定し、アップグレード
  が pull の副作用ではなく判断になるようにします。

## ⏪ 古いリリースに戻す

新しい版を戻す必要があるときは、GitHub Releases から前の版を取得し、検証して、
バイナリを差し替えます。

```bash
mkdir -p /tmp/rollback && cd /tmp/rollback
curl -fsSLO https://github.com/dorianverlaine/pingclair/releases/download/v0.2.0-rc.2/pingclair-linux-x86_64.tar.gz
curl -fsSLO https://github.com/dorianverlaine/pingclair/releases/download/v0.2.0-rc.2/SHA256SUMS-x86_64.txt
sha256sum -c SHA256SUMS-x86_64.txt
mkdir -p extract && tar -xzf pingclair-linux-x86_64.tar.gz -C extract
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

戻した版に対して設定を検証します。その版が実装していないディレクティブは、無視
されるのではなく名前を挙げて拒否されます。

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## 🧹 削除する

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

この後 `systemctl status pingclair` は `Unit pingclair.service could not be
found` と答え、コマンドは消え、80 ポートで何も待ち受けません。ディスクに残る
ものは意図的にあなたのデータです。

```text
/etc/Pingclair/Pingclairfile      設定。そのまま有効です
/var/lib/pingclair/certs          発行済み証明書と ACME の状態
/var/lib/pingclair/html           案内ページ
/var/log/pingclair                ログ出力先のディレクトリ
```

再導入する予定があるなら `/var/lib/pingclair/certs` を残します。証明書と内部
ルートが生き残り、そのルートを信頼しているクライアントも動き続けます。その
ホストで Pingclair を終えるなら、サービスアカウントごと削除します。

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ うまくいかないとき

- **想定と違う版が入った。** インストーラは常に最新のリリースタグを取ります。
  `pingclair version` で確認し、特定の版が必要だったなら上のロールバックを
  使います。
- **アップグレード後にサービスが起動しない。**
  `sudo pingclair validate /etc/Pingclair/Pingclairfile` を読みます。新しい版が
  拒否するディレクティブは名前と代替を示して fail closed するので、journal が
  直す行を教えます。
- **コンテナがすぐ終了する。** `docker logs <container>` が理由を示します。
  よくある原因は、マウントした設定ディレクトリに
  `/etc/pingclair/Pingclairfile` が無いこと、またはホスト側でポートが使用中で
  あることです。
- **ストアの再生成後にクライアントが証明書を拒否する。** 内部認証局を作り直す
  と、古いルートは何も署名しません。新しいルートを
  `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust` で導入します。

## 🧭 次の手順

- [インストール](/ja/start/install/): このページが残す、または消す配置。
- [サービスとして動かす](/ja/start/service/): アップグレードが書き直すユニット。
- [プロジェクトの状態](/ja/project/status/): 現在のリリースが何を支え、何を
  拒否するか。
