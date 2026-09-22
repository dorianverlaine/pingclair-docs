---
title: 설치
h1_emoji: '📦'
sidebar:
  order: 1
description: 릴리스 바이너리, Docker 또는 소스에서 Linux 호스트에 Pingclair를 설치하고 서비스가 응답하는지 확인합니다.
---

Pingclair는 단일 Linux 바이너리로 배포됩니다. 이 페이지에서는 설치하고,
설치 프로그램이 무엇을 남겼는지 보여 주고, 서버가 응답하는지 확인합니다. 현재
릴리스는 **v0.2.0-rc.3**(릴리스 후보)이며, 이 사이트의 모든 페이지가 그
릴리스를 설명합니다.

## 🧾 필요한 것

- `x86_64` 또는 `aarch64` Linux 호스트. 두 아키텍처 모두 릴리스 바이너리가
  게시되어 있습니다.
- `sudo` 또는 root. 설치 프로그램은 `/usr/local/bin`, `/etc/Pingclair`,
  `/var/lib/pingclair`, `/etc/systemd/system`에 씁니다.
- 서비스로 운영하려면 `systemd`. 없는 호스트에서는 Docker를 쓰거나 포그라운드로
  실행합니다(둘 다 아래에서 다룹니다).
- 공개 인증서가 필요하면 인터넷에서 80과 443 포트에 도달할 수 있어야 합니다
  ([HTTPS](/ko/start/https/)). 클라우드 인스턴스라면 제공자 방화벽도 함께 열어야
  합니다.

macOS에서의 소스 빌드는 개발용으로 지원됩니다. macOS는 배포 대상이 아닙니다.

## 📦 릴리스 바이너리로 설치

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

스크립트는 `releases.pingclair.com`의 릴리스 채널을 읽고, 설치하려는 태그를
출력하며, 그 채널이 공개한 SHA-256과 아카이브를 대조합니다——일치하지 않는
아카이브는 풀지 않고 거부합니다. 이 호스트에 닿을 수 없으면 GitHub 릴리스
API와 아카이브 옆에 공개된 체크섬 파일로 물러서므로, 설치가 한 제공자에
의존하지 않습니다. 이어서 서비스 사용자를 만들고 낮은 포트에 바인딩할 권한을
주고, 기본 설정을 쓰고, 유닛을 설치하고, 서비스를 시작합니다. 끝까지
진행하면 다음과 같이 끝납니다.

```text
Detected architecture: x86_64
Installing v0.2.0-rc.3 — a release candidate, not a final release.
Downloading https://releases.pingclair.com/pingclair/releases/0.2.0-rc.3/pingclair-linux-x86_64.tar.gz (from releases.pingclair.com)...
✅ sha256 matches the release channel document
Creating system user 'pingclair'...
Setting capabilities...
Configuring directories and assets...
Fetching default landing page...
Creating default Pingclairfile...
Installing Systemd service...
Creating 'pc' symlink...
✅ Installation Complete!
Use pc service status to check the service.
Config: /etc/Pingclair/Pingclairfile
```

아직 릴리스되지 않은 수정이 필요하면 릴리스 바이너리 대신 `main`을 설치합니다.

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main`은 호스트에서 저장소를 복제해 컴파일합니다. Rust 1.98 이상과 BoringSSL,
jemalloc이 요구하는 C 도구 모음(`cmake`, `clang`, `libclang-dev`, `g++`,
`git`)이 필요합니다. 이 패키지들은 `apt`와 `dnf` 모두에서 스크립트가 직접
설치합니다. BoringSSL을 소스에서 빌드하므로 첫 빌드는 몇 분 걸립니다.

## 🗂️ 설치 프로그램이 남긴 것

| 경로 | 내용 |
| --- | --- |
| `/usr/local/bin/pingclair` | 서버 바이너리. |
| `/usr/local/bin/pc` | 같은 바이너리를 가리키는 심볼릭 링크(짧은 이름). |
| `/etc/Pingclair/Pingclairfile` | 서비스가 실행하는 설정. |
| `/etc/Pingclair/Pingclairfile.example` | 주석이 달린 예제. 업그레이드해도 덮어쓰지 않습니다. |
| `/var/lib/pingclair/.local/share/pingclair` | 인증서 저장소. 서비스 계정의 데이터 디렉터리이며 바이너리의 기본값입니다. |
| `/var/lib/pingclair/html` | 80 포트에서 제공되는 안내 페이지. |
| `/var/log/pingclair` | `log` 싱크를 설정했을 때 기록되는 위치. |
| `/etc/systemd/system/pingclair.service` | 활성화되어 실행 중인 유닛. |

스크립트가 끝난 시점에 서비스는 이미 응답하고 있습니다. 실행 중인 설정은
안내용이며 한 화면에 들어갑니다.

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

서비스 사용자와 인증서 저장소는 없을 때만 만들고, 기존
`/etc/Pingclair/Pingclairfile`은 절대 교체하지 않습니다. 그래서 설치 프로그램을
다시 실행하는 것이 초기화가 아니라 업그레이드가 됩니다
([업그레이드와 삭제](/ko/start/upgrade/)).

## ✅ 설치 확인

바이너리에 버전을 묻습니다.

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc`는 같은 바이너리이므로 `pc version`도 같은 문자열을 출력합니다. 다음은
`systemd`에 묻습니다.

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://github.com/dorianverlaine/pingclair
   Main PID: 1808 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"`는 프로세스가 살아 있다고 `systemd`가 추측한 값이 아니라
서버가 직접 보낸 값입니다. 유닛은 `notify` 형식이고, 모든 리스너가 바인딩된
뒤에야 준비 완료를 알립니다.

마지막으로 서버에 묻습니다.

```bash
curl -i http://localhost/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 18747
Last-Modified: Tue, 22 Sep 2026 03:21:54 GMT
ETag: "493b-6ab1f452"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag`와 `Last-Modified`가 있는 `200`은 파일 서버가 응답했다는 뜻이고, 본문은
`/var/lib/pingclair/html`의 안내 페이지입니다.

## 🐳 Docker

공개 이미지는 설정 파일 모드로 실행됩니다. entrypoint는 `pingclair`, 기본
명령은 `run /etc/pingclair/Pingclairfile`입니다. 이미지는 `/etc/pingclair`와
`/var/lib/pingclair`를 볼륨으로 선언하고 80, 443 포트를 노출합니다.

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv:ro
      - pingclair_tls:/var/lib/pingclair

volumes:
  pingclair_tls:
```

```bash
mkdir -p conf site
printf ':80 {\n    file_server /srv\n}\n' > conf/Pingclairfile
echo '<h1>hello from the container</h1>' > site/index.html
docker compose up -d
curl -i http://localhost/
```

틀리기 쉬운 점이 세 가지 있습니다.

- **`command:`를 추가하지 마세요.** 이미지 기본값이 이미
  `run /etc/pingclair/Pingclairfile`이고, 덮어쓰면 그 명령이 교체됩니다.
- **`/var/lib/pingclair/.local/share/pingclair`만 마운트하지 마세요.** 저장소는 인증서
  디렉터리 옆에도 상태를 두므로, `certs`만 마운트한 채 컨테이너를 다시 만들면
  그 상태를 잃습니다. `/var/lib/pingclair`를 마운트합니다.
- **공개 태그를 고정하세요.** `latest`는 최신 릴리스를 따라갑니다. 운영에서는
  예제처럼 버전을 지정합니다. 공개 태그는
  [패키지 페이지](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)에
  있습니다.

사용자가 `docker` 그룹에 없는 호스트에서는 명령 앞에 `sudo`를 붙이거나
`sudo usermod -aG docker "$USER"`로 한 번 그룹에 추가한 뒤 새 로그인 세션을
여십시오. Ubuntu에서는 `docker compose` 플러그인이 `docker-compose-v2`
패키지에 들어 있습니다.

## 🛠️ 소스에서 빌드

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

필요 환경: Rust 1.98.1(CI가 고정한 버전), `cmake`, `clang`, `libclang-dev`,
`g++`, `git`. 빌드 과정에서 BoringSSL을 소스로 컴파일하므로 첫 빌드는 몇 분
걸립니다.

## ⚠️ 설치가 실패할 때

- **`This script must be run as root`.** 스크립트는 홈 디렉터리 밖에 쓰고 유닛을
  설치합니다. `sudo`를 붙여 다시 실행하십시오.
- **Fedora에서 `setcap: command not found`.** 그것은 `libcap` 패키지입니다.
  설치 프로그램이 넣어 주지만 손으로 구성한 호스트에는 없을 수 있고, 그 권한이
  없으면 서비스가 80과 443에 바인딩할 수 없습니다.
- **설치 직후 `Job for pingclair.service failed`.** `journalctl -u pingclair -n 20`을
  읽으십시오. 흔한 원인은 검증을 통과하지 못한 설정이거나, 이미 80 포트를 잡고
  있는 다른 프로세스입니다.
- **서비스는 도는데 밖에서 아무것도 응답하지 않음.** 리스너는 바인딩됐고 패킷이
  도착하지 않습니다. 먼저 제공자의 방화벽이나 보안 그룹을, 다음으로 호스트
  자체의 규칙을 확인하십시오.
- **호스트에 `systemd`가 없음.** 바이너리는 설치되어 쓸 수 있지만 설치 프로그램의
  서비스 단계는 실행할 수 없습니다. Docker나 `pingclair run`을 사용하십시오.

## 🧹 삭제하기

[업그레이드와 삭제](/ko/start/upgrade/)에 정리 절차와 보존할 가치가 있는 데이터가
담긴 디렉터리를 정리해 두었습니다.

## 🧭 다음 단계

- [퀵스타트](/ko/start/quickstart/): 안내 페이지를 자신의 설정으로 바꾸고 실제
  사이트를 서비스합니다.
- [HTTPS](/ko/start/https/): 공개 이름을 위한 인증서.
- [서비스로 실행](/ko/start/service/): 유닛이 하는 일과 안전한 재적용 방법.
