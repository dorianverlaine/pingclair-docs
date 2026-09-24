---
title: 설치
h1_emoji: '📦'
sidebar:
  order: 1
description: 릴리스 바이너리, Docker, 소스 빌드 중 하나로 Linux 호스트에 Pingclair를 설치하고 서비스가 응답하는지 확인합니다.
---

Pingclair는 단일 Linux 바이너리로 배포됩니다. 이 페이지에서는 설치하고, 설치
프로그램이 남긴 것을 살펴보고, 서버가 응답하는지 확인합니다. 현재 릴리스는 릴리스
후보인 **v0.2.0-rc.3**이며, 이 사이트의 모든 페이지는 이 릴리스를 기준으로 합니다.

## 🧾 준비물

- `x86_64` 또는 `aarch64` Linux 호스트. 두 아키텍처 모두 릴리스 바이너리가
  있습니다.
- `sudo` 또는 root 권한. 설치 프로그램은 `/usr/local/bin`, `/etc/Pingclair`,
  `/var/lib/pingclair`, `/etc/systemd/system`에 씁니다.
- 서비스로 운영하려면 `systemd`. 없는 호스트에서는 Docker를 쓰거나 서버를
  포그라운드로 실행합니다. 둘 다 아래에서 다룹니다.
- 공개 인증서가 필요하다면 인터넷에서 80번과 443번 포트에 접근할 수 있어야 합니다
  ([HTTPS](/ko/start/https/)). 클라우드 인스턴스라면 대개 프로바이더의
  방화벽에서도 열어야 합니다.

macOS에서는 소스로 빌드할 수 있고 개발용으로 지원합니다. 배포 대상 플랫폼은
아닙니다.

## 📦 릴리스 바이너리로 설치하기

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

스크립트는 `releases.pingclair.com`의 릴리스 채널을 읽어 설치할 태그를 출력하고,
채널이 게시한 SHA-256으로 아카이브를 검사합니다. 일치하지 않는 아카이브는 압축을
풀지 않고 거부합니다. 이 호스트에 접근할 수 없으면 GitHub 릴리스 API와 아카이브
옆에 게시된 체크섬 파일로 대신하므로, 설치가 한 제공자에 의존하지 않습니다. 이어서
서비스 사용자를 만들고, 그 사용자에게 낮은 포트를 바인딩할 권한(capability)을
부여하고, 기본 설정을 쓰고, 유닛을 설치한 뒤 서비스를 시작합니다. 정상적으로
끝나면 다음과 같이 출력됩니다.

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

아직 릴리스되지 않은 수정을 쓰려면 대신 호스트에서 `main`을 빌드합니다.

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main`은 호스트에서 서버를 클론해 컴파일합니다. Rust 1.98 이상과 BoringSSL,
jemalloc에 필요한 C 툴체인(`cmake`, `clang`, `libclang-dev`, `g++`, `git`)이
필요합니다. 스크립트는 `apt`와 `dnf` 시스템 모두에서 이 패키지를 직접 설치합니다.
BoringSSL을 소스에서 컴파일하므로 첫 빌드에는 몇 분이 걸립니다.

## 🗂️ 설치 프로그램이 남기는 것

| 경로 | 내용 |
| --- | --- |
| `/usr/local/bin/pingclair` | 서버 바이너리입니다. |
| `/usr/local/bin/pc` | 짧게 쓰기 위한, 같은 바이너리의 심볼릭 링크입니다. |
| `/etc/Pingclair/Pingclairfile` | 서비스가 실행하는 설정입니다. |
| `/etc/Pingclair/Pingclairfile.example` | 주석이 달린 예시입니다. 업그레이드해도 덮어쓰지 않습니다. |
| `/var/lib/pingclair/.local/share/pingclair` | 인증서 저장소입니다. 서비스 사용자의 데이터 디렉터리이며, 바이너리가 기본으로 찾는 위치입니다. |
| `/var/lib/pingclair/html` | 80번 포트에서 제공되는 임시 사이트입니다. |
| `/var/log/pingclair` | `log` 싱크를 설정하면 로그가 기록되는 곳입니다. |
| `/etc/systemd/system/pingclair.service` | 활성화되어 실행 중인 유닛입니다. |

스크립트가 끝나면 서비스는 이미 동작하고 있습니다. 실행 중인 설정은 임시 설정이며,
한 화면에 읽을 수 있을 만큼 짧습니다.

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

서비스 사용자와 인증서 저장소는 없을 때만 만들며, 기존
`/etc/Pingclair/Pingclairfile`은 절대 교체하지 않습니다. 그래서 설치 프로그램을
다시 실행하면 초기화가 아니라 업그레이드가 됩니다
([업그레이드와 삭제](/ko/start/upgrade/)).

## ✅ 설치 확인하기

바이너리에 버전을 묻습니다.

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc`도 같은 바이너리이므로 `pc version`도 같은 문자열을 출력합니다. 다음으로
`systemd`의 판단을 확인합니다.

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"`은 `systemd`가 프로세스가 살아 있는지만 보고 내린 판단이 아니라
서버가 직접 보낸 값입니다. 유닛 타입이 `notify`이고, 서버는 모든 리스너를
바인딩한 뒤에야 준비되었다고 알립니다.

마지막으로 서버에 직접 묻습니다.

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

`ETag`와 `Last-Modified`가 붙은 `200`은 파일 서버가 응답했다는 뜻이며, 본문은
`/var/lib/pingclair/html`의 임시 페이지입니다.

## 🐳 Docker

공개 이미지는 설정 파일 모드로 실행됩니다. 엔트리포인트는 `pingclair`이고 기본
명령은 `run /etc/pingclair/Pingclairfile`입니다. 이미지는 `/etc/pingclair`와
`/var/lib/pingclair`를 볼륨으로 선언하고 80번과 443번 포트를 노출(expose)합니다.

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

- **`command:`를 추가하지 않습니다.** 이미지의 기본값이 이미
  `run /etc/pingclair/Pingclairfile`이며, 재정의하면 이 명령이 대체됩니다.
- **인증서 디렉터리만이 아니라 `/var/lib/pingclair` 전체를 마운트합니다.**
  저장소는 인증서 옆에 상태를 함께 보관하므로, 일부만 마운트한 채 컨테이너를 다시
  만들면 그 상태를 잃습니다.
- **릴리스된 태그를 고정합니다.** `latest`는 가장 최근 릴리스를 따라갑니다. 운영
  환경에서는 예시처럼 버전을 명시합니다. 게시된 태그는
  [패키지 페이지](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)에
  있습니다.

사용자가 `docker` 그룹에 속하지 않은 호스트에서는 명령 앞에 `sudo`를 붙이거나,
`sudo usermod -aG docker "$USER"`로 한 번 그룹에 가입한 뒤 새로 로그인합니다.
Ubuntu에서 `docker compose` 플러그인은 `docker-compose-v2` 패키지로 설치합니다.

## 🛠️ 소스에서 빌드하기

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

요구 사항은 Rust 1.98.1(CI가 고정한 버전), `cmake`, `clang`, `libclang-dev`, `g++`,
`git`입니다. 빌드 과정에서 BoringSSL을 소스에서 컴파일하므로 첫 빌드에는 몇 분이
걸립니다.

## ⚠️ 설치가 실패할 때

- **`This script must be run as root`.** 스크립트는 홈 디렉터리 밖에 쓰고 유닛을
  설치합니다. `sudo`로 다시 실행합니다.
- **Fedora에서 `setcap: command not found`.** `libcap` 패키지입니다. 설치
  프로그램이 추가하지만, 직접 구성한 호스트에는 없을 수 있으며, 이 권한이 없으면
  서비스가 80번과 443번 포트를 바인딩할 수 없습니다.
- **설치 직후 `Job for pingclair.service failed`.** `journalctl -u pingclair -n 20`을
  읽습니다. 흔한 원인은 검증을 통과하지 못하는 설정이거나, 80번 포트를 이미 다른
  프로세스가 쓰고 있는 경우입니다.
- **서비스는 실행 중인데 외부에서 응답이 없습니다.** 리스너는 바인딩되었지만 패킷이
  도착하지 않습니다. 먼저 프로바이더의 방화벽이나 보안 그룹을, 그다음 호스트 자체
  규칙을 확인합니다.
- **호스트에 `systemd`가 없습니다.** 바이너리는 설치되어 쓸 수 있지만 설치
  프로그램의 서비스 단계는 실행되지 않습니다. Docker나 `pingclair run`을 씁니다.

## 🧹 다시 제거하기

[업그레이드와 삭제](/ko/start/upgrade/)에서 제거 절차와, 보존할 가치가 있는
데이터가 든 디렉터리를 안내합니다.

## 🧭 다음 단계

- [빠른 시작](/ko/start/quickstart/): 임시 설정을 직접 작성한 설정으로 바꾸고 실제
  사이트를 서비스합니다.
- [HTTPS](/ko/start/https/): 공개 이름용 인증서를 받습니다.
- [서비스로 실행하기](/ko/start/service/): 유닛이 하는 일과 안전하게 리로드하는
  방법을 다룹니다.
