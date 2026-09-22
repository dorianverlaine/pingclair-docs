---
title: 업그레이드와 삭제
h1_emoji: '🧹'
sidebar:
  order: 5
description: 설치 프로그램을 다시 실행해 업그레이드하고, 컨테이너 태그를 고정하고, 이전 릴리스로 되돌리고, 남길 가치가 있는 것을 잃지 않고 전부 제거합니다.
---

업그레이드가 바꾸는 것은 두 가지 — 바이너리와 서비스 유닛 — 뿐이고, 설정과
인증서는 그대로 둡니다. 이 페이지는 그것을 보여 주고, 컨테이너에서의 같은 절차,
버전을 되돌려야 할 때의 경로, 그리고 철거를 다룹니다.

## 🧾 무엇이 무엇을 견디는가

| 경로 | 업그레이드 시 |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | 유지. 설치 프로그램은 없을 때만 씁니다. |
| `/etc/Pingclair/Pingclairfile.example` | 현재 예제로 교체됩니다. |
| `/var/lib/pingclair/.local/share/pingclair` | 유지. 발급된 인증서와 ACME 상태가 그대로 남습니다. |
| `/var/lib/pingclair/html` | 유지. |
| `/usr/local/bin/pingclair`와 `pc` | 새 릴리스로 교체됩니다. |
| `/etc/systemd/system/pingclair.service` | 다시 쓰이고 서비스가 재시작됩니다. |

## ⬆️ 설치 프로그램으로 업그레이드

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

스크립트는 GitHub에 최신 릴리스 태그를 묻고, 출력하고, 아카이브의 SHA-256을
검증하고, 바이너리와 유닛을 교체한 뒤 서비스를 재시작합니다. 이미 있는 설정
파일은 건드리지 않습니다. 그래서 이것이 초기화가 아니라 업그레이드가 됩니다.

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

새 버전과, 이전 설정이 여전히 서비스되는지 확인합니다.

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

설치 프로그램은 항상 최신 릴리스를 설치합니다. 특정 버전을 지정하는 플래그는
없습니다. 그럴 때는 아래 롤백을 씁니다.

## 🐳 컨테이너 업그레이드

호스트에는 아무것도 설치되지 않으므로 업그레이드는 태그 변경과 pull입니다.
compose 파일에서 새 릴리스를 고정합니다.

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

설정과 인증서 저장소는 볼륨 안에 있으므로 새 컨테이너는 이전 컨테이너가 남긴
자리에서 그것들을 찾습니다. 주의할 점이 둘 있습니다.

- **80 포트를 매핑한 컨테이너는 systemd 서비스가 도는 동안 시작할 수 없습니다.**
  둘 중 하나를 멈추십시오: `sudo pc service stop`, 또는 컨테이너 쪽 공개 포트를
  바꾸십시오.
- **`latest`는 최신 릴리스를 따라갑니다.** 운영에서는 버전을 고정해, 업그레이드가
  pull의 부작용이 아니라 결정이 되게 하십시오.

## ⏪ 이전 릴리스로 되돌리기

새 버전을 되돌려야 할 때는 릴리스 호스트에서 이전 버전을 받아, 그 버전이 공개한
다이제스트와 대조한 뒤 바이너리를 교체합니다.

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

되돌린 버전에 대해 설정을 검증하십시오. 그 버전이 구현하지 않은 지시어는 무시되지
않고 이름을 대며 거부됩니다.

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## 🧹 삭제하기

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

그 뒤 `systemctl status pingclair`는 `Unit pingclair.service could not be
found`라고 답하고, 명령은 사라지며, 80 포트에서 아무것도 듣지 않습니다. 디스크에
남는 것은 의도적으로 당신의 데이터입니다.

```text
/etc/Pingclair/Pingclairfile      설정. 그대로 유효합니다
/var/lib/pingclair/.local/share/pingclair          발급된 인증서와 ACME 상태
/var/lib/pingclair/html           안내 페이지
/var/log/pingclair                로그 출력 디렉터리
```

다시 설치할 계획이면 `/var/lib/pingclair/.local/share/pingclair`를 남기십시오. 인증서와 내부
루트가 살아남고, 그 루트를 신뢰하는 클라이언트도 계속 동작합니다. 그 호스트에서
Pingclair를 끝낸다면 서비스 계정까지 지웁니다.

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ 잘 되지 않을 때

- **예상과 다른 버전이 설치됨.** 설치 프로그램은 항상 최신 릴리스 태그를
  가져옵니다. `pingclair version`으로 확인하고, 특정 버전이 필요했다면 위의
  롤백을 쓰십시오.
- **업그레이드 후 서비스가 시작하지 않음.**
  `sudo pingclair validate /etc/Pingclair/Pingclairfile`을 읽으십시오. 새 버전이
  거부하는 지시어는 이름과 대안을 밝히며 fail closed 하므로 journal이 고칠 줄을
  알려 줍니다.
- **컨테이너가 곧바로 종료됨.** `docker logs <container>`가 이유를 보여 줍니다.
  흔한 원인은 마운트한 설정 디렉터리에 `/etc/pingclair/Pingclairfile`이 없는
  것, 또는 호스트에서 포트가 이미 사용 중인 것입니다.
- **저장소를 다시 만든 뒤 클라이언트가 인증서를 거부함.** 내부 인증 기관을
  재생성하면 옛 루트는 아무것도 서명하지 않습니다. 새 루트를
  `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust`로
  설치하십시오.

## 🧭 다음 단계

- [설치](/ko/start/install/): 이 페이지가 남기거나 지우는 배치.
- [서비스로 실행](/ko/start/service/): 업그레이드가 다시 쓰는 유닛.
- [프로젝트 상태](/ko/project/status/): 현재 릴리스가 무엇을 지원하고 무엇을
  거부하는지.
