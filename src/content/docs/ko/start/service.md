---
title: 서비스로 실행하기
h1_emoji: '🔁'
sidebar:
  order: 4
description: 설치된 systemd 유닛이 하는 일, 시작·중지·리로드 방법, 로그의 위치, 그리고 실패하는 설정이 밖에서 어떻게 보이는지 설명합니다.
---

설치 프로그램은 `systemd` 유닛을 활성화하고 실행한 상태로 남겨 둡니다. 이
페이지는 그 유닛을 한 줄씩 읽고, 다루는 방법을 보여 주고, 두 가지 실패, 즉 시작하지
않는 서버와 실행 중인 서버가 거부한 설정이 밖에서 어떻게 보이는지 설명합니다.

## 🧾 유닛이 하는 일

```bash
systemctl cat pingclair
```

중요한 키는 다음과 같습니다.

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

순서대로 읽어 봅니다.

- `Type=notify`와 `NotifyAccess=main`: 서버가 리스너 바인딩을 마쳤을 때
  `systemd`에 알립니다. 그래서 `systemctl start`는 프로세스가 생길 때가 아니라
  프록시가 응답할 수 있을 때까지 기다립니다.
- `User=pingclair`와 `AmbientCapabilities=CAP_NET_BIND_SERVICE`: 서버는 권한 없이
  실행되면서도 80번과 443번 포트를 바인딩할 수 있습니다.
- 여기에는 의도적으로 `PINGCLAIR_TLS_STORE`가 없습니다. 서비스 계정의 홈이
  `/var/lib/pingclair`이므로 인증서는 `/var/lib/pingclair/.local/share/pingclair`에
  있습니다. 바이너리 자체의 기본값이자, 설치 프로그램이 만들고 마이그레이션하는
  디렉터리이며, `pingclair environ`이 출력하는 경로입니다. 여기서 저장소를 따로
  지정하면 이미 답이 있는 질문에 두 번째 답을 만드는 셈입니다.
- 여기에는 의도적으로 `validate`를 실행하는 `ExecStartPre`가 없습니다. 검사를 두기
  안전한 곳처럼 보이지만 바로 그것이 함정입니다. `systemd`는
  `RestartPreventExitStatus=`를 메인 프로세스에만 적용하고 실패한 사전 명령에는
  적용하지 않으므로, 컴파일러가 거부한 설정이 유닛을 실패 상태로 두는 대신 5초마다
  재시도되었습니다. 서버는 무엇이든 바인딩하기 전에 직접 파일을 컴파일하고, 거부하면
  1로 종료합니다. 위의 재시작 정책은 바로 이 종료 코드를 위해 작성되었으며,
  `pingclair run`이 그 프로세스 역할을 합니다.
- `ExecReload`는 `SIGUSR1`을 보냅니다. 서버는 이 신호를 "파일을 다시 읽으라"는
  뜻으로 받아들입니다. `SIGHUP`은 의도적으로 무시하며, `SIGHUP`을 보내던 유닛은 이전
  설정이 계속 서비스되는 동안 성공을 보고했습니다
  ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)). `systemd`는
  `kill`이 종료했다는 사실만 관찰할 수 있으므로, 서버는 파일을 어떻게 처리했는지
  이 유닛의 상태 줄에 게시합니다. `Serving (reloaded 1 listener(s) in 323.341µs)`
  또는 `Reload rejected: …`이며, `systemctl status`에 표시됩니다. 자세한 내용은
  아래 [리로드 절](#-리로드의-의미)에 있습니다.
- `Restart=on-failure`, `RestartPreventExitStatus=1`, `RestartSec=5s`: 종료 코드 1은
  설정이나 인증서 저장소를 전혀 쓸 수 없다는 뜻입니다. 따라서 유닛을 5초마다
  재시도하지 않고 운영자가 살펴볼 수 있도록 `failed` 상태로 둡니다. 다른 실패는
  재시작합니다.
- `ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`, `LimitNPROC`,
  `LimitNOFILE`: 서버는 필요한 파일 시스템 범위와 프로세스 한도만 받고 그 이상은
  받지 않습니다.

두 설치 경로 모두 같은 파일을 씁니다. 한 줄 설치 스크립트에는
`scripts/pingclair.service`가 바이트 단위로 똑같이 들어 있고, 둘이 어긋나면
`just repo-lint`가 실패합니다. 그래서 새로 `curl | bash`로 설치하든 체크아웃에서
설치하든 같은 유닛이 만들어지며, 어느 경로에서든
`systemd-analyze verify /etc/systemd/system/pingclair.service`는 이 유닛에 대해
아무것도 보고하지 않습니다.

## 🎛️ 서비스 다루기

`pc service`는 이 유닛에 대한 `systemctl`을 감싼 것이므로 둘은 바꿔 써도 됩니다.

| 작업 | `pc` 사용 | `systemctl` 사용 |
| --- | --- | --- |
| 시작 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 중지 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 설정 리로드 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 재시작(리스너나 프로세스 전체에 걸친 변경 후) | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 상태 | `pc service status` | `systemctl status pingclair` |
| 로그 따라가기 | — | `journalctl -u pingclair -f` |

`pc service status`는 서버가 보낸 준비 상태 줄을 포함해 유닛 자체의 관점을
출력합니다.

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 05:57:21 UTC; 18s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
```

## 🔁 리로드의 의미

수정한 `/etc/Pingclair/Pingclairfile`은 하나의 신호로 실행 중인 서버에 전달되며,
이 신호를 보내는 명령이 두 가지 있습니다.

리로드 신호는 `SIGUSR1`이며, 이를 위해 따로 설정할 것은 없습니다.

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload`, 그리고 같은 호출인 `sudo systemctl reload pingclair`가 이
신호를 대신 보내 줍니다. 유닛의 `ExecReload`가 `/bin/kill -USR1 $MAINPID`이므로
당연해 보이는 명령이 이제 실제로 동작합니다. 예전처럼 `SIGHUP`을 보내던 유닛은
성공을 보고하고도 아무것도 적용하지 않았으며,
[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)이 이를 기록하고
있습니다.

`pingclair reload`는 Admin API를 거쳐 같은 코드에 도달하고 서버가 파일을 어떻게
판단했는지 알려 줍니다. 이 명령에는 전역 옵션 블록의 `admin` 옵션이 필요합니다.

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload`가 보고할 수 있는 것은 `kill`이 신호를 전달했다는 사실
하나뿐입니다. 서버는 그다음에 파일을 읽으므로, 판정은 유닛의 상태 줄과 저널에
남습니다. `pc service reload`는 설정이 적용되었다고 주장하는 대신 이 점을 그대로
알려 줍니다.

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

실행 중인 서버가 파일의 요구를 적용할 수 없으면 이전 설정이 계속 서비스되고,
상태 줄에 어떤 변경이 거부되었는지 표시됩니다. 사이트를 `:80`에서 `:8080`으로
옮기는 경우가 대표적입니다. 리스너 구성은 시작할 때 소켓과 함께 만들어지기
때문입니다.

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

어떤 경로를 쓰든 컴파일되지 않는 설정은 이전 설정을 그대로 실행 상태로 두므로
사이트는 계속 응답합니다. 먼저 검증합니다.

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

실행 중인 프로세스가 흡수할 수 없는 변경은 예외입니다. `trusted_proxies`처럼 시작할
때 정해지는 옵션은 재시작해야 적용됩니다(`sudo pc service restart`). 리스너를
추가하거나 옮기는 설정도 같은 방식으로 거부되며, 상태 줄에 추가되고 제거된 주소가
표시됩니다. 리로드는 정책을 적용할 뿐 새 리스닝 소켓을 만들지 않기 때문입니다.

## 🛑 중지의 의미

`systemctl stop`은 `SIGTERM`을 보냅니다. v0.2.0-rc.3에서는 `grace_period` 값과
관계없이 약 0.25초 뒤에 프로세스가 종료되므로, 그 순간 처리 중이던 요청은 응답 없이
끊깁니다. 중지나 재시작은 짧은 중단을 감수할 수 있을 때 하고, 사이트 설정만 바뀌었다면
리로드를 쓰는 편이 좋습니다.

📌 **다음 릴리스**. `main`에서는 중지할 때 먼저 요청을 정리합니다. `/ready`가 `503`으로
응답하고, 리스너가 닫히고, 처리 중인 요청이 끝나며, 마지막 요청이 끝나거나
`grace_period`(기본값 30초)가 지나면 프로세스가 종료됩니다.

## 📜 로그

유닛은 `RUST_LOG=info`를 설정하고 모든 출력을 저널로 보냅니다.

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

시작, 리로드, 인증서 작업, 그리고 요청마다 한 줄씩 액세스 로그가 여기에 남습니다.

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

서버가 거부한 리로드도 같은 방식으로 기록되며, 이유와 함께 아무것도 바뀌지 않았다는
메모가 남습니다.

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

로테이션되는 별도 로그가 필요하면 `log` 싱크를 설정해 `/var/log/pingclair` 아래에
기록합니다. 이 디렉터리는 설치 프로그램이 만들어 서비스 사용자에게 넘겨 둡니다.

## ⚠️ 서비스가 올라오지 않을 때

- **`is-active`가 `activating`이고 `NRestarts`가 계속 올라갑니다.** 이전 설치
  프로그램이 쓴 유닛이며, 두 가지 결함이 있었습니다. `RestartPreventExitStatus`
  없이 `Restart=always`를 썼고, `validate`를 `ExecStartPre` 명령으로 실행했는데
  `RestartPreventExitStatus`는 이 명령에 적용되지 않습니다. 그래서 컴파일러가 거부한
  설정이 5초마다 재시도되었고, 실패한 유닛이 아니라 끝없이 자리를 잡지 못하는 유닛처럼
  보였습니다. 현재 설치되는 유닛은 `Restart=on-failure` +
  `RestartPreventExitStatus=1`이고 사전 명령이 없으므로, 거부된 시작은 `is-active`를
  `failed`로, `NRestarts`를 0으로 둡니다. 이전 설치라면 디버깅 전에 반복부터
  멈춥니다. `sudo systemctl stop pingclair`로 멈추고, 파일을 고친 뒤
  `sudo systemctl reset-failed pingclair`를 실행합니다.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** 서버가 무엇이든 바인딩하기 전에 설정을 거부했으며, 컴파일러가 밝힌
  이유는 저널에 있습니다. 예를 들면
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``입니다.
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`.**
  저장소는 서비스 계정의 소유입니다.
  `sudo ls -ld /var/lib/pingclair/.local/share/pingclair`로 확인하며, 소유자가
  `pingclair`여야 합니다.
- **`systemd-analyze verify`가 설치된 유닛에 대해 `Missing '=', ignoring line`을
  보고합니다.** 예전 한 줄 설치 스크립트가 셸에 의해 주석이 확장된 유닛을
  썼습니다. `systemd`가 무시하는 `--help` 출력 25줄입니다. 현재 설치 프로그램으로 다시
  설치하면 유닛이 원문 그대로 기록되고 이 보고는 사라집니다.
- **유닛은 실행 중인데 아무것도 응답하지 않습니다.** 리스너는 바인딩되었지만 요청이
  도착하지 않습니다. [설치 페이지](/ko/start/install/)에서처럼 프로바이더의
  방화벽을, 그다음 호스트의 방화벽을 확인합니다.

## 🧭 다음 단계

- [업그레이드와 삭제](/ko/start/upgrade/): 재실행이 무엇을 보존하는지, 그리고 모두
  다시 제거하는 방법을 다룹니다.
- [HTTPS](/ko/start/https/): 저장소의 위치와 `pingclair trust`에
  `PINGCLAIR_TLS_STORE`가 필요한 이유를 포함해 인증서를 다룹니다.
- [`log`](/ko/reference/directives/#log): 이 페이지가 저널에서 읽는 액세스 로그
  싱크입니다.
