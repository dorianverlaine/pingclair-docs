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
Environment="PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs"
ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -HUP $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=always
RestartSec=5s
LimitNOFILE=1048576
```

순서대로 읽습니다.

- `Type=notify`와 `NotifyAccess=main`: 서버는 리스너가 바인딩된 시점을
  `systemd`에 알립니다. 그래서 `systemctl start`는 프로세스의 존재가 아니라
  프록시가 응답할 수 있을 때까지 기다립니다.
- `User=pingclair`와 `AmbientCapabilities=CAP_NET_BIND_SERVICE`: 서버는 비특권
  사용자로 실행되면서도 80과 443에 바인딩할 수 있습니다.
- `PINGCLAIR_TLS_STORE`: 인증서는 `/var/lib/pingclair/certs`에 있습니다. 서비스
  계정에는 홈 디렉터리가 없으므로 바이너리 기본값에 맡기면 존재하지 않는
  `$HOME`을 가리키게 됩니다.
- `ExecStartPre`는 시작할 때마다 `validate`를 실행합니다. 컴파일되지 않는 설정은
  서버에 도달하지 않습니다.
- `ExecReload`는 `SIGHUP`을 보냅니다. 재적용은 프로세스를 다시 시작하지 않고 같은
  파일을 다시 읽습니다.
- `Restart=always`와 `RestartSec=5s`: 시작에 실패하면 5초마다 다시 시도합니다.
  사람을 놀라게 하는 설정이므로 실패 형태를 아래에 적었습니다.

⚠️ `curl | bash` 설치 방식은 유닛의 축소본을 씁니다. 저장소의
`scripts/pingclair.service`는 강화 옵션(`ProtectSystem=full`, `PrivateTmp`,
`NoNewPrivileges`, `LimitNPROC`)과 다른 재시작 정책(`Restart=on-failure`와
`RestartPreventExitStatus=1`)을 더합니다. 더 엄격한 유닛을 쓰려면 다음과 같이
합니다.

```bash
git clone https://github.com/dorianverlaine/pingclair
sudo cp pingclair/scripts/pingclair.service /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo systemctl restart pingclair
```

## 🎛️ 서비스 다루기

`pc service`는 이 유닛에 대한 `systemctl` 래퍼이므로 둘은 서로 바꿔 쓸 수
있습니다.

| 작업 | `pc` 사용 | `systemctl` 사용 |
| --- | --- | --- |
| 시작 | `sudo pc service start` | `sudo systemctl start pingclair` |
| 중지 | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| 다시 시작 | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| 설정 재적용 | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| 상태 | `pc service status` | `systemctl status pingclair` |
| 로그 따라가기 | — | `journalctl -u pingclair -f` |

`pc service status`는 서버가 보낸 준비 완료 줄을 포함해 유닛 자체의 시야를
보여 줍니다.

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
    Process: 1805 ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile (code=exited, status=0/SUCCESS)
   Main PID: 1808 (pingclair)
     Status: "Serving"
```

## 🔁 재적용의 의미

수정한 설정을 반영하는 방법은 두 가지이며, 파일이 잘못됐을 때의 동작이 다릅니다.

`pc service reload`는 `SIGHUP`을 전달합니다. 신호가 전달된 시점에 성공을
보고합니다.

```text
✅ Service reloaded successfully
```

`pingclair reload`는 Admin API를 거치며 전역 옵션 블록의 `admin`이 필요합니다.
서버가 그 파일을 어떻게 봤는지 보고합니다.

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

두 경우 모두 컴파일되지 않는 설정은 이전 설정을 그대로 두므로 사이트는 계속
응답합니다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/
```

```text
200
```

그래서 먼저 검증하고 재적용은 형식적인 절차로 다룹니다.

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
```

예외는 프로세스 전역 정책입니다. `trusted_proxies`처럼 시작 시 확립되는 옵션은
재시작 후에만 효력을 냅니다: `sudo pc service restart`.

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
INFO pingclair_proxy::server: ♻️ Configuration reloaded successfully
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

회전이 있는 별도 로그를 원하면 `log` 싱크를 설정해 설치 프로그램이 만들고 서비스
사용자에게 준 `/var/log/pingclair` 아래에 쓰게 합니다.

## ⚠️ 서비스가 올라오지 않을 때

- **`is-active`가 `activating`이고 `NRestarts`가 계속 증가.** 설치된 재시작
  정책이 동작하는 것입니다. `Restart=always`는 5초마다 다시 시도하므로, 망가진
  설정은 "한 번 실패한 유닛"이 아니라 "끝내 안정되지 않는 유닛"으로 보입니다.
  디버깅 전에 루프를 멈추십시오: `sudo systemctl stop pingclair`, 파일을 고친 뒤
  `sudo systemctl reset-failed pingclair`.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** `ExecStartPre`가 설정을 거부했고 컴파일러의 이유가 journal에
  있습니다. 예:
  `Error: ❌ Configuration Error: Compile error: Unsupported feature: 'encode br': Brotli is not implemented for proxied responses; use 'encode zstd gzip'`.
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`.**
  저장소는 서비스 계정의 것입니다. `sudo ls -ld /var/lib/pingclair/certs`로
  소유자가 `pingclair`인지 확인하십시오.
- **`systemd-analyze verify`가 설치된 유닛에 대해 `Missing '=', ignoring line`을
  보고.** 원라이너 설치가 쓰는 축소본에는 셸 치환에서 나온 불필요한 줄이 섞여
  있고 `systemd`는 이를 무시합니다. 저장소의 `scripts/pingclair.service`를
  설치하면 사라집니다.
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
