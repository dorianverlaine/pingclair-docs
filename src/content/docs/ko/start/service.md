---
title: 서비스로 실행
h1_emoji: '🔁'
sidebar:
  order: 4
description: 설치된 systemd 유닛이 하는 일, 시작·중지·재적용 방법, 로그가 가는 곳, 그리고 설정이 잘못됐을 때 밖에서 어떻게 보이는지 설명합니다.
---

설치 프로그램은 `systemd` 유닛을 활성화한 채 실행 중으로 남깁니다. 이 페이지는
그 유닛을 차례로 읽고, 다루는 방법을 보여 주고, 두 가지 실패 형태를 밖에서 보이는
그대로 설명합니다. 시작하지 않는 서버와, 실행 중인 서버가 설정을 거부하는
경우입니다.

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

순서대로 읽습니다.

- `Type=notify`와 `NotifyAccess=main`: 서버는 리스너가 바인딩된 시점을
  `systemd`에 알립니다. 그래서 `systemctl start`는 프로세스의 존재가 아니라
  프록시가 응답할 수 있을 때까지 기다립니다.
- `User=pingclair`와 `AmbientCapabilities=CAP_NET_BIND_SERVICE`: 서버는 비특권
  사용자로 실행되면서도 80과 443에 바인딩할 수 있습니다.
- `PINGCLAIR_TLS_STORE`는 의도적으로 두지 않습니다. 서비스 계정의 홈이
  `/var/lib/pingclair`이므로 인증서는 `/var/lib/pingclair/.local/share/pingclair`에
  있습니다——바이너리 자체의 기본값이고, 설치 프로그램이 만들고 이전해 넣는
  디렉터리이며, `pingclair environ`이 출력하는 경로입니다. 여기서 저장소를
  이름으로 지정하면 이미 답이 있는 질문에 두 번째 답을 만드는 셈입니다.
- `ExecStartPre`로 `validate`를 돌리는 일은 의도적으로 하지 않습니다. 안전한 검사
  자리처럼 보이지만 그것이 함정입니다. `systemd`가 `RestartPreventExitStatus=`를
  적용하는 대상은 주 프로세스이지 실패한 사전 명령이 아닙니다. 그래서 컴파일러가
  거부하는 설정은 유닛을 failed로 남겨 두는 대신 5초마다 다시 시도되었습니다.
  서버는 무엇이든 바인딩하기 전에 파일을 스스로 컴파일하고, 거부할 때 종료 코드
  1로 끝납니다. 그것이 위의 재시작 정책이 쓰인 이유인 종료 코드이며,
  `pingclair run`은 그 프로세스가 되기 위해 존재합니다.
- `ExecReload`는 `SIGUSR1`을 보냅니다. 서버가 "파일을 다시 읽어라"로 해석하는
  신호입니다. `SIGHUP`은 의도적으로 무시되며, 그것을 보내던 유닛은 이전 설정이
  계속 서비스되는 동안 성공을 보고했습니다
  ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)). `systemd`가
  관찰할 수 있는 것은 `kill`의 종료뿐이므로, 서버는 파일을 어떻게 처리했는지를
  유닛의 status line에 올립니다 — `Serving (reloaded 1 listener(s) in 323.341µs)`
  또는 `Reload rejected: …` — 그리고 `systemctl status`가 그것을 보여 줍니다.
  자세한 내용은 아래 [재적용의 의미](#-재적용의-의미)에 있습니다.
- `Restart=on-failure`와 `RestartPreventExitStatus=1`, `RestartSec=5s`: 종료
  코드 1은 설정이나 인증서 저장소를 아예 쓸 수 없었다는 뜻이므로, 5초마다 다시
  시도하는 대신 유닛은 운영자가 보도록 `failed` 상태로 남습니다. 그 밖의 실패는
  다시 시작합니다.
- `ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`, `LimitNPROC`,
  `LimitNOFILE`: 서버는 필요한 파일 시스템 시야와 프로세스 한도만 받고, 그 이상은
  받지 않습니다.

두 설치 경로 모두 같은 파일을 씁니다. 한 줄 설치는
`scripts/pingclair.service`의 바이트 단위 사본을 내장하고 — `just repo-lint`는
둘이 어긋나면 실패합니다 — `curl | bash` 신규 설치와 저장소 설치가 같은 유닛을
만들며, `systemd-analyze verify /etc/systemd/system/pingclair.service`는 어느
쪽에서도 이 유닛에 대해 아무것도 보고하지 않습니다.

## 🎛️ 서비스 다루기

`pc service`는 이 유닛에 대한 `systemctl` 래퍼이므로 둘은 서로 바꿔 쓸 수
있습니다.

| 작업 | `pc` 사용 | `systemctl` 사용 |
| --- | --- | --- |
| 시작 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 중지 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 설정 재적용 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 리스너나 프로세스 전역 변경 후 다시 시작 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 상태 | `pc service status` | `systemctl status pingclair` |
| 로그 따라가기 | — | `journalctl -u pingclair -f` |

`pc service status`는 서버가 보낸 준비 완료 줄을 포함해 유닛 자체의 시야를
보여 줍니다.

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
       Docs: https://pingclair.com/start/service/
   Main PID: 1808 (pingclair)
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

## 🔁 재적용의 의미

수정한 `/etc/Pingclair/Pingclairfile`은 하나의 신호로 실행 중인 서버에 도달하고,
두 명령이 그 신호를 보냅니다.

`SIGUSR1`이 재적용 신호이고, 추가 설정이 필요 없습니다.

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload` — 같은 호출인 `sudo systemctl reload pingclair`도 — 가 그
신호를 대신 보냅니다. 유닛의 `ExecReload`는 `/bin/kill -USR1 $MAINPID`이고,
당연해 보이는 명령이 이제 동작하는 명령입니다. `SIGHUP`을 보내던 유닛은 성공을
보고하고 아무것도 적용하지 않았습니다. 그것이
[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)에 기록되어
있습니다.

`pingclair reload`는 Admin API를 거쳐 같은 코드에 도달하고 서버가 파일을 어떻게
봤는지 보고합니다. 전역 옵션 블록의 `admin`이 필요합니다.

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload`가 보고할 수 있는 것은 하나뿐입니다. `kill`이 신호를 전달했다는
사실입니다. 서버는 그 뒤에 파일을 읽으므로, 그 판단은 유닛의 status line과
저널에 남습니다. `pc service reload`는 설정이 적용되었다고 주장하는 대신 그렇게
말합니다.

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

실행 중인 서버가 파일이 요구하는 것을 적용할 수 없으면 이전 설정이 계속
서비스되고, status line은 어떤 변경이 거부되었는지 알려 줍니다. 사이트를 `:80`
에서 `:8080`으로 옮기는 것이 흔한 예입니다. 리스너 구성은 시작할 때 소켓과 함께
다시 만들어지기 때문입니다.

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

어느 경로든 컴파일되지 않는 설정은 이전 설정을 그대로 둡니다. 먼저 검증하십시오.

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

예외는 프로세스 전역 정책입니다. `trusted_proxies`처럼 시작 시 확립되는 옵션은
재시작 후에만 효력을 냅니다: `sudo pc service restart`. 리스너를 추가하거나
옮기는 설정도 같은 방식으로 거부됩니다 — status line이 추가되고 제거된 주소를
알려 줍니다 — 재적용이 적용하는 것은 정책이지 새로운 대기 소켓이 아니기
때문입니다.

## 📜 로그

유닛은 `RUST_LOG=info`를 설정하고 모든 것을 journal로 보냅니다.

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

시작, 재적용, 인증서 작업, 요청마다 한 줄의 액세스 로그가 그곳에 나타납니다.

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 📋 Step 1/3: Validating configuration...
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

서버가 거부한 재적용도 같은 방식으로, 이유와 "아무것도 바뀌지 않았다"는 사실과
함께 기록됩니다.

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

회전이 있는 별도 로그를 원하면 `log` 싱크를 설정해 설치 프로그램이 만들고 서비스
사용자에게 준 `/var/log/pingclair` 아래에 쓰게 합니다.

## ⚠️ 서비스가 올라오지 않을 때

- **`is-active`가 `activating`이고 `NRestarts`가 계속 증가.** 설치된 재시작
  정책이 아니라 옛 유닛의 은퇴한 동작입니다. 그 유닛은
  `RestartPreventExitStatus` 없이 `Restart=always`를 달고 있었으므로, 서버가
  거부하는 설정은 5초마다 다시 시도되어 "한 번 실패한 유닛"이 아니라 "끝내
  안정되지 않는 유닛"으로 보였습니다. 원인은 하나 더 있습니다. `validate`를
  `ExecStartPre`로 돌렸는데, `RestartPreventExitStatus`는 그것을 덮지 않습니다.
  설치되는 유닛은 `Restart=on-failure` + `RestartPreventExitStatus=1`을 달고
  있고 사전 명령이 없습니다. 거부된 시작은 `is-active`를 `failed`로,
  `NRestarts`를 0으로 남깁니다. 옛 설치에서는 디버깅 전에 루프를 멈추십시오:
  `sudo systemctl stop pingclair`, 파일을 고친 뒤
  `sudo systemctl reset-failed pingclair`.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** 무엇이든 바인딩하기 전에 서버가 설정을 거부했고, 컴파일러의
  이유가 journal에 있습니다. 예:
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`.**
  저장소는 서비스 계정의 것입니다. `sudo ls -ld /var/lib/pingclair/.local/share/pingclair`로
  소유자가 `pingclair`인지 확인하십시오.
- **`systemd-analyze verify`가 설치된 유닛에 대해 `Missing '=', ignoring line`을
  보고.** 옛 원라이너 설치는 주석이 셸에 의해 확장된 유닛을 썼습니다 —
  `--help` 출력 25줄이고 `systemd`는 이를 무시합니다. 현재 설치 프로그램으로
  다시 설치하면 유닛이 그대로 기록되어 이 보고는 사라집니다.
- **유닛은 실행 중인데 아무것도 응답하지 않음.** 리스너는 바인딩됐고 요청이
  도착하지 않습니다. [설치](/ko/start/install/)와 마찬가지로 먼저 제공자의
  방화벽, 다음으로 호스트 쪽을 확인하십시오.

## 🧭 다음 단계

- [업그레이드와 삭제](/ko/start/upgrade/): 재실행이 무엇을 보존하는지, 그리고
  전부 제거하는 방법.
- [HTTPS](/ko/start/https/): 인증서, 저장소 위치, 그리고 `pingclair trust`에
  `PINGCLAIR_TLS_STORE`가 필요한 이유.
- [`log`](/ko/reference/directives/#log): 이 페이지가 journal에서 읽는 액세스
  로그의 출력 대상.
