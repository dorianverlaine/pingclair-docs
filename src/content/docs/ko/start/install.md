---
title: 설치
h1_emoji: '📦'
description: 릴리스 바이너리, Docker, 또는 소스에서 Pingclair를 설치합니다.
---

Pingclair는 Linux를 대상으로 합니다. 릴리스 바이너리는 `x86_64`와 `aarch64` 두 아키텍처로 제공됩니다. macOS는 소스 빌드를 지원하지만 개발 용도이며 배포 대상 플랫폼은 아닙니다.

## 📌 릴리스 상태

기본 설치 대상은 **v0.2.0-rc.3**이며 릴리스 후보입니다. 설치 스크립트는 실제로 설치한 태그를 출력하고, 압축을 풀기 전에 공개된 SHA-256 체크섬을 검증합니다.

`v0.1.x` 계열은 더 이상 유지보수되지 않습니다. 수정도, 백포트도, 보안 공지도 없습니다. 옮겨야 할 이유 중 하나는 `v0.1.x`가 Admin API의 `api_key` 필드를 파싱하면서 한 번도 읽지 않아, 그 필드가 아무것도 보호하지 않았다는 점입니다.

## 📦 릴리스 바이너리로 설치

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

스크립트는 현재 아키텍처에 맞는 릴리스 바이너리를 내려받아 체크섬을 검증하고, `pingclair`와 `pc` 별칭을 설치하며, 비특권 사용자 `pingclair`를 만들고, 낮은 포트를 바인딩하는 데 필요한 capability를 부여하고, `systemd` 유닛을 설치합니다.

`main` 브랜치를 빌드해 설치하려면:

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main`은 로컬에서 컴파일합니다. Rust 1.98 이상과 BoringSSL, jemalloc에 필요한 C 도구 모음(`cmake`, `clang`, `libclang-dev`, `g++`, `git`)이 필요합니다.

설치 확인:

```bash
pingclair version
pc version
```

## 🐳 Docker

이미지는 이미 config-file 모드로 동작합니다. entrypoint는 `pingclair`, 기본 명령은 `run /etc/pingclair/Pingclairfile`입니다. 따라서 Compose 서비스는 설정 파일과 데이터 저장소만 마운트하면 됩니다.

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv
      - pingclair_tls:/var/lib/pingclair/certs

volumes:
  pingclair_tls:
```

`Pingclairfile`은 `./conf/`에, 정적 파일은 `./site/`에 두고 설정에서는 `root /srv` 같은 컨테이너 내부 절대 경로로 참조합니다. HTTPS, 80번 포트 리디렉션, HTTP/3 동작은 호스트에 직접 배포한 경우와 같습니다.

실수하기 쉬운 두 가지:

- **🔒 TLS 저장소는 캐시가 아니라 상태입니다.** 발급된 인증서, ACME 계정 키, 내부 인증 기관이 들어 있습니다. 삭제하면 인증서를 다시 발급해야 하고, 신뢰하는 클라이언트는 새 내부 루트 인증서를 다시 신뢰해야 합니다.
- **⚠️ `command:`를 추가하지 마십시오.** 이미지 기본 명령이 이미 `run /etc/pingclair/Pingclairfile`이며, 덮어쓰면 그 명령이 대체됩니다.

운영 환경에서는 `latest` 대신 릴리스 태그를 고정하십시오. 공개된 태그는 [패키지 페이지](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair)에 있습니다.

## 🛠️ 소스에서 빌드

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

필요한 것은 Rust 1.98.1(CI가 고정한 버전), `cmake`, `clang`, `libclang-dev`, `g++`, `git`입니다. BoringSSL을 소스에서 빌드하므로 첫 빌드는 몇 분 걸립니다.

## 🧭 다음 단계

- [빠른 시작](/ko/start/quickstart/): 첫 설정을 작성하고 검증한 뒤 실제로 실행합니다.
- [설정 모델](/ko/concepts/configuration/): 검증이 무엇을 실행 가능하다고 판단하는지.
