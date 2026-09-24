---
title: 업그레이드와 삭제
h1_emoji: '🧹'
sidebar:
  order: 5
description: 설치 프로그램을 다시 실행해 업그레이드하고, 컨테이너 태그를 고정하고, 이전 릴리스로 되돌리고, 보존할 데이터는 남긴 채 모두 제거합니다.
---

업그레이드는 바이너리와 서비스 유닛 두 가지만 교체하고, 설정과 인증서는 그대로
둡니다. 이 페이지는 그 과정과 컨테이너에서의 대응 방법, 버전을 되돌려야 할 때의
롤백 절차, 그리고 제거 방법을 설명합니다.

## 🧾 무엇이 남고 무엇이 바뀌는가

| 경로 | 업그레이드 시 |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | 유지됩니다. 설치 프로그램은 파일이 없을 때만 씁니다. |
| `/etc/Pingclair/Pingclairfile.example` | 현재 예시로 교체됩니다. |
| `/var/lib/pingclair/.local/share/pingclair` | 유지됩니다. 발급된 인증서와 ACME 상태가 그대로 남습니다. |
| `/var/lib/pingclair/html` | 유지됩니다. |
| `/usr/local/bin/pingclair`와 `pc` | 새 릴리스로 교체됩니다. |
| `/etc/systemd/system/pingclair.service` | 다시 쓴 뒤 서비스를 재시작합니다. |

## ⬆️ 설치 프로그램으로 업그레이드하기

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

스크립트는 릴리스 채널에서 최신 릴리스를 찾아 태그를 출력하고, 아카이브의
SHA-256을 검증하고, 바이너리와 유닛을 교체한 뒤 서비스를 재시작합니다. 채널
호스트에 접근할 수 없으면 대신 GitHub 릴리스 API에 묻습니다. 아래 실행이 그
경로를 탔기 때문에 `Fetching latest release`가 출력됩니다. 이미 있는 설정 파일은
건드리지 않으므로 초기화가 아니라 업그레이드가 됩니다.

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

새 버전과, 기존 설정이 여전히 서비스되는지 확인합니다.

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

설치 프로그램은 항상 최신 릴리스를 설치합니다. 특정 버전을 설치하는 플래그는
없으며, 그럴 때는 아래의 롤백 절차를 씁니다.

## ⚠️ 0.2.0 전에 업그레이드 노트 읽기

다음 릴리스는 설정을 바꾸지 않아도 드러나는 동작을 바꿉니다. 어떤 라우트가 요청에
응답하는지, `encode`가 없는 사이트가 압축하는지, 기본 요청 본문 한도, `remote_ip`가
무엇과 일치하는지, 내부 인증 기관이 루트를 어디에 두는지입니다.
[프로젝트 상태](/ko/project/status/#-다음-릴리스에서-바뀌는-것)에 요약되어 있고,
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)에는
항목마다 업그레이드 노트가 있습니다. 새 바이너리로 서비스를 재시작하기 전에 그
바이너리로 설정을 검증합니다.

## 🐳 컨테이너 업그레이드하기

호스트에 설치되는 것이 없으므로 업그레이드는 태그를 바꾸고 이미지를 받는 것으로
끝납니다. compose 파일에 새 릴리스를 고정합니다.

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

설정과 인증서 저장소는 볼륨에 있으므로, 새 컨테이너는 이전 컨테이너가 남긴 자리에서
그대로 찾습니다. 주의할 점은 두 가지입니다.

- **80번 포트를 매핑하는 컨테이너는 systemd 서비스가 실행 중이면 시작할 수
  없습니다.** 둘 중 하나를 멈춥니다. `sudo pc service stop`을 쓰거나 컨테이너 쪽
  게시 포트를 바꿉니다.
- **`latest`는 가장 최근 릴리스를 따라갑니다.** 운영 환경에서는 버전을 고정해,
  업그레이드가 이미지를 받다가 생기는 부수 효과가 아니라 의도한 결정이 되게 합니다.

## ⏪ 이전 릴리스로 되돌리기

새 릴리스를 물려야 할 때는 릴리스 호스트에서 이전 릴리스를 받아, 그 릴리스가
게시한 다이제스트로 검증하고, 바이너리 자리에 넣습니다.

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

그런 다음 되돌린 버전으로 설정을 검증합니다. 이전 릴리스가 구현하지 않은
디렉티브는 무시되지 않고 이름과 함께 거부되기 때문입니다.

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## 🧹 제거하기

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

이후 `systemctl status pingclair`는 `Unit pingclair.service could not be found`로
응답하고, 명령은 사라지며, 80번 포트에서 아무것도 수신하지 않습니다. 디스크에 남는
것은 의도적으로 남긴 데이터입니다.

```text
/etc/Pingclair/Pingclairfile      the configuration, still valid
/var/lib/pingclair/.local/share/pingclair          issued certificates and ACME state
/var/lib/pingclair/html           the placeholder site
/var/log/pingclair                a log sink's directory
```

다시 설치할 계획이라면 `/var/lib/pingclair/.local/share/pingclair`를 남겨 둡니다.
인증서와 내부 루트가 보존되고, 그 루트를 신뢰하는 클라이언트도 계속 동작합니다.
호스트에서 Pingclair를 완전히 걷어 낼 때는 서비스 계정까지 모두 삭제합니다.

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ 문제가 생겼을 때

- **예상하지 않은 버전이 설치되었습니다.** 설치 프로그램은 항상 최신 릴리스 태그를
  씁니다. `pingclair version`으로 확인하고, 특정 버전이 필요했다면 위의 롤백 절차를
  씁니다.
- **업그레이드 후 서비스가 시작되지 않습니다.**
  `sudo pingclair validate /etc/Pingclair/Pingclairfile`의 출력을 읽습니다. 새
  릴리스가 거부하는 디렉티브는 이름과 대안을 밝히며 닫힌 상태로 실패하므로, 저널에
  고쳐야 할 줄이 나옵니다.
- **컨테이너가 곧바로 종료됩니다.** `docker logs <container>`가 이유를 보여 줍니다.
  흔한 원인은 마운트한 설정 디렉터리에 `/etc/pingclair/Pingclairfile`이 없거나,
  호스트에서 포트를 이미 쓰고 있는 경우입니다.
- **저장소를 다시 만든 뒤 클라이언트가 인증서를 거부합니다.** 내부 인증 기관이 새로
  만들어졌다면 이전 루트는 더 이상 아무것도 서명하지 않습니다. 새 루트를
  `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust`로
  설치합니다.

## 🧭 다음 단계

- [설치](/ko/start/install/): 이 페이지가 유지하거나 제거하는 디렉터리 구성입니다.
- [서비스로 실행하기](/ko/start/service/): 업그레이드가 다시 쓰는 유닛입니다.
- [프로젝트 상태](/ko/project/status/): 현재 릴리스가 지원하는 것과 거부하는
  것입니다.
