---
title: 명령줄
h1_emoji: '⌨️'
description: 바이너리가 제공하는 모든 하위 명령을 플래그, 기본값, 전제 조건과 함께 `pingclair --help`와 대조해 설명합니다.
---

Pingclair는 하나의 바이너리로 배포되며, 명령줄은 Unix의 관례대로 다음 모양을
따릅니다.

```bash
pingclair <command> [<args…>]
```

꺾쇠는 필수, 대괄호는 선택, `…`는 반복할 수 있는 값을 뜻합니다. 모든 명령은
`--help`에 이 페이지를 쓸 때 사용한 것과 같은 텍스트를 돌려주고,
`pingclair help <command>`도 같은 내용을 보여 줍니다. 명령 없이 실행하면 목록이
나옵니다.

설치 프로그램은 바이너리를 `pc`로도 링크하므로 아래 모든 명령에는 두 글자 철자가
있습니다: `pc validate`, `pc service reload` 등. 둘은 같은 프로그램이고, `pc`는
심볼릭 링크이지 두 번째 바이너리가 아닙니다.

## 🚩 전역 플래그

| 플래그 | 효과 |
| --- | --- |
| `-v`, `--verbose` | 이 실행의 로그 수준을 `debug`로 올립니다. 명령 앞뒤 어디에나 쓸 수 있습니다. |
| `-h`, `--help` | 붙은 명령의 도움말을 출력합니다. |
| `-V`, `--version` | 버전을 출력합니다. 최상위 전용입니다. |

## 🧭 명령 한눈에 보기

| 명령 | 효과 |
| --- | --- |
| `run` | 서버를 포그라운드에서 실행합니다. |
| `reload` | 수정한 설정을 Admin API로 적용하고, 서버가 어떻게 판단했는지 보고합니다. |
| `start` | 터미널에서 분리된 서버 사본을 시작합니다. |
| `stop` | 실행 중인 서버를 Admin API로 중지합니다. |
| `completion` | 셸 완성 스크립트를 출력합니다. |
| `environ` | 서버가 보게 될 환경을 출력합니다. |
| `list-modules` | 이 바이너리에 포함된 모듈을 나열합니다. |
| `build-info` | 도구 모음을 포함한 빌드 정보를 출력합니다. |
| `manpage` | man 페이지를 디렉터리에 씁니다. |
| `storage-export` | 인증서 저장소를 tar 아카이브로 옮깁니다. |
| `storage-import` | 그 아카이브에서 저장소를 복원합니다. |
| `trust` | 내부 CA 루트를 시스템 신뢰 저장소에 설치합니다. |
| `untrust` | 그것을 다시 제거합니다. |
| `respond` | 개발용으로 고정된 응답을 제공합니다. |
| `reverse-proxy` | 설정 파일 없이 업스트림으로 프록시합니다. |
| `file-server` | 설정 파일 없이 디렉터리를 제공합니다. |
| `validate` | 설정을 컴파일하고 무엇이 잘못되었는지 보고합니다. |
| `adapt` | Pingclairfile이 컴파일되는 JSON을 출력합니다. |
| `fmt` | Pingclairfile을 서식화하거나, 서식화가 무엇을 바꿀지 보여 줍니다. |
| `hash-password` | `basic_auth`용 비밀번호 해시를 만듭니다. |
| `version` | 버전을 출력합니다. |
| `service` | 설치된 systemd 유닛을 조작합니다. |

## pingclair run

하나의 설정 문서로 서버를 포그라운드에서 실행합니다. 로그는 표준 출력과 표준
오류로 가고, `Ctrl-C`가 서버를 멈춥니다.

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 인수 | 기본값 | 효과 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, 다음 `./Caddyfile` | 읽을 설정 파일 또는 디렉터리. |

| 플래그 | 효과 |
| --- | --- |
| `-r`, `--resume` | `caddy run --resume`처럼 Admin API가 마지막으로 자동 저장한 설정을 읽습니다. 둘 다 있으면 `CONFIG`를 덮어씁니다. |
| `-w`, `--watch` | 설정 파일을 감시하고(mtime을 1초마다 확인) 변경 때마다 프로세스에 재적용 신호를 보냅니다. 거부된 편집이 곧바로 보이는 로컬 개발용입니다. |

```bash
pingclair run --watch
```

터미널보다 오래 사는 서버에는 설치된 유닛
([서비스로 실행](/ko/start/service/))이나
[빠른 시작](/ko/start/quickstart/)을 쓰십시오. 후자는 같은 명령을 서비스로
풀어냅니다.

## pingclair reload

수정한 설정을 Admin API로 실행 중인 서버에 적용합니다. 요청에 응답하는 것이
서버이므로 이 명령은 서버가 파일을 어떻게 봤는지 보고합니다. 신호의 경우 systemd가
확인할 수 있는 것은 전달 여부뿐이라는 점이 다릅니다.

```bash
pingclair reload [OPTIONS]
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, 다음 `./Caddyfile` | 적용할 설정 파일. |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 주소. |

Admin API가 실행 중이어야 합니다. 전역 옵션 `admin`이 그것을 켜며, 그 옵션이 없는
설정에는 도달할 엔드포인트가 없습니다. 실행 중인 서버가 적용할 수 없는 재적용——
리스너 구성 변경이 대표적입니다——은 이전 설정을 계속 서비스합니다.

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

셸이 끝나도 남는 서버 사본을 서비스 관리자 없이 시작합니다.

```bash
pingclair start [OPTIONS]
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, 다음 `./Caddyfile` | 읽을 설정 파일. |

프로세스는 터미널에서 분리되고 출력은 버려지므로 어디에도 기록이 남지 않습니다.
systemd가 있는 호스트에서는 설치된 유닛이 더 나은 도구입니다. 로그를 붙잡고,
실패하면 다시 시작하며, 리스너가 바인딩된 시점을 압니다.
[서비스로 실행](/ko/start/service/)을 보십시오.

## pingclair stop

실행 중인 서버를 Admin API로 중지합니다. Admin API가 노출하는 `POST /stop`과
같습니다. `reload`처럼 `admin` 옵션이 필요합니다.

```bash
pingclair stop [OPTIONS]
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 주소. |

## pingclair completion

셸 하나를 위한 완성 스크립트를 출력합니다. 받아들이는 이름은 인수가 취하는 것과
정확히 같습니다: `bash`, `zsh`, `fish`, `powershell`, `elvish`.

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

서버가 실행될 환경을 출력합니다. `PINGCLAIR_TLS_STORE` 같은 값을 시작 뒤의 실패에서
추측하는 대신 시작 전에 확인할 수 있습니다.

```bash
pingclair environ
```

## pingclair list-modules

이 바이너리에 포함된 모듈과 기능을 나열합니다. `--json`은 같은 목록을 스크립트용
구조화 출력으로 보여 줍니다.

```bash
pingclair list-modules [--json]
```

## pingclair build-info

빌드 정보를 출력합니다: 버전, 대상, 그리고 그 바이너리를 만든 도구 모음. 결함을
보고할 때 정확히 어느 빌드인지 밝힐 수 있어 유용합니다.

```bash
pingclair build-info
```

## pingclair manpage

이미 존재하는 디렉터리에 man 페이지를 씁니다. 플래그가 필수이므로 현재 디렉터리에
실수로 쓰이는 일이 없습니다.

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

`PINGCLAIR_TLS_STORE`가 가리키는 인증서 저장소를 tar 아카이브로 씁니다. 출력 경로에
`-`를 주면 표준 출력으로 씁니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

아카이브에는 개인 키가 들어 있으므로 모드 `600`으로 쓰이며, 버킷으로 보내는
백업이 아니라 암호화된 매체에 두어야 합니다. 무엇을 담고 언제 옮기는지는
[TLS 가이드](/ko/guides/tls-tuning/)에 있습니다.

## pingclair storage-import

`storage-export`가 쓴 아카이브에서 저장소를 복원합니다. `-`는 표준 입력에서
아카이브를 읽습니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

내부 CA 루트 인증서를 시스템 신뢰 저장소에 설치합니다. 이후 브라우저와 명령줄
클라이언트는 그 인증 기관이 발급한 인증서를 받아들입니다. CA는
`PINGCLAIR_TLS_STORE`가 가리키는 저장소에서 읽습니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

언제 필요한지와 잘 되었는지 확인하는 방법은 [HTTPS](/ko/start/https/)에 있습니다.

## pingclair untrust

그 루트 인증서를 시스템 신뢰 저장소에서 다시 제거합니다. 이미 발급된 인증서의
파일은 남지만 클라이언트는 더 이상 신뢰하지 않습니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

고정된 응답——상태, 헤더, 본문——을 제공합니다. 개발용과, 언제나 같은 방식으로
응답하는 오리진에 클라이언트를 시험할 때 씁니다.

```bash
pingclair respond [OPTIONS]
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | 돌려줄 상태 코드. |
| `-H`, `--header <HEADERS>` | 없음 | `Field: value` 형식의 응답 헤더. 반복 가능. |
| `-b`, `--body <BODY>` | 비어 있음 | 응답 본문. |
| `-l`, `--listen <LISTEN>` | 임의의 루프백 포트 | 대기 주소. |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

`--listen`을 생략하면 포트가 선택되어 출력되므로 개발 서버 둘이 고정 포트를 두고
다투지 않습니다.

## pingclair reverse-proxy

설정 파일을 쓰지 않고 대기 주소에서 하나 이상의 업스트림으로 가는 프록시를
시작합니다. [리버스 프록시 가이드](/ko/guides/reverse-proxy/)의 한 줄 버전이며,
장난감이 아니라 운영 형태의 설정을 제공합니다. 업스트림은 필수이고, 여러 `--to`는
부하를 나눕니다.

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 대기 주소. |
| `--to <TO>` | 필수 | 업스트림 주소. 여러 번 지정할 수 있습니다. |
| `--header-up <HEADERS_UP>` | 없음 | 업스트림으로 보낼 요청 헤더(`Field: value`). 반복 가능. |
| `--header-down <HEADERS_DOWN>` | 없음 | 하류로 보낼 응답 헤더(`Field: value`). 반복 가능. |
| `--insecure` | 꺼짐 | 업스트림 인증서가 맞지 않을 때 TLS 검증을 생략합니다. |
| `--internal-certs` | 꺼짐 | 이 리스너의 인증서를 공개 인증서 대신 내부 CA에서 발급합니다. |
| `--disable-redirects` | 꺼짐 | HTTP에서 HTTPS로 가는 리디렉션 리스너를 준비하지 않습니다. |
| `-c`, `--change-host-header` | 꺼짐 | Caddy처럼 업스트림의 `Host` 헤더를 업스트림 주소로 다시 씁니다. |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

설정 파일 없이 디렉터리를 HTTP로 제공합니다.

```bash
pingclair file-server [OPTIONS]
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 대기 주소. |
| `--root <ROOT>` | `.` | 제공할 디렉터리. |
| `-b`, `--browse` | 꺼짐 | 디렉터리 목록을 보여 줍니다. |
| `-d`, `--domain <DOMAIN>` | 없음 | 이 도메인을 HTTPS로 제공합니다. `--listen`이 포트여야 합니다. |
| `--access-log` | 꺼짐 | 요청마다 액세스 로그 한 줄을 씁니다. |
| `--no-compress` | 꺼짐 | 응답 압축을 끕니다. |
| `--file-limit <FILE_LIMIT>` | 없음 | 디렉터리 목록에 표시할 파일 수 상한. |
| `--templates` | 꺼짐 | Caddy처럼 `.html` 파일을 템플릿으로 렌더링합니다. |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

압축, 캐시 헤더, 단일 페이지 애플리케이션 폴백은 설정 파일의 일입니다.
[정적 사이트 가이드](/ko/guides/static-site/)가 다룹니다.

## pingclair validate

아무것도 시작하지 않고 설정을 컴파일해 첫 번째 문제를 보고합니다. 설정이 거부되면
종료 코드가 0이 아니므로 파이프라인이나 배포 스크립트에서도 쓸 수
있습니다.

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 인수 | 기본값 | 효과 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, 다음 `./Caddyfile` | 검사할 설정 파일 또는 디렉터리. |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

설정이 컴파일되는 JSON을 출력합니다. `--pretty`는 읽기 좋게 들여쓰고,
`--validate`는 문법만이 아니라 파일 시스템에 닿는 검사——인증서 경로 등——도
실행합니다.

```bash
pingclair adapt [OPTIONS]
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, 다음 `./Caddyfile` | 읽을 설정 파일. |
| `-p`, `--pretty` | 꺼짐 | JSON을 들여씁니다. |
| `--validate` | 꺼짐 | 변환된 문서가 참조하는 것도 검증합니다. |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Pingclairfile을 서식화해 결과를 출력합니다. 경로를 생략하면 `./Pingclairfile`을
읽고, `-`는 표준 입력을 읽습니다.

```bash
pingclair fmt [OPTIONS] [PATH]
```

| 플래그 | 효과 |
| --- | --- |
| `-o`, `--overwrite` | 서식화한 텍스트를 출력하는 대신 파일에 다시 씁니다. |
| `-d`, `--diff` | 서식화한 파일이 아니라 눈에 보이는 차이를 출력합니다. |

```bash
pingclair fmt --diff              # 무엇이 바뀔지
pingclair fmt --overwrite         # 적용하기
```

## pingclair hash-password

`basic_auth` 지시어용 비밀번호 해시를 만듭니다. `--plaintext`를 생략하면 비밀번호를
표준 입력에서 읽으므로 셸 기록에 남지 않습니다.

```bash
pingclair hash-password [OPTIONS]
```

| 플래그 | 기본값 | 효과 |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | 표준 입력에서 읽음 | 해시할 비밀번호. |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` 또는 `argon2id`. |
| `--bcrypt-cost <COST>` | `14` | bcrypt 비용(4~31). 높을수록 느리고 강합니다. |
| `--argon2id-time <TIME>` | `1` | argon2id 반복 횟수. |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id 메모리 비용(KiB). |
| `--argon2id-threads <THREADS>` | `4` | argon2id 병렬도. |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id 출력 길이(바이트). |

```bash
pingclair hash-password --algorithm argon2id
```

출력을 지시어에 붙여 넣으십시오. 주변 문법은
[`basic_auth`](/ko/reference/directives/#basic_auth)에 있습니다.

## pingclair version

버전을 출력합니다. 릴리스 후보라면 `v0.2.0-rc.3`처럼 나옵니다.

```bash
pingclair version
```

## pingclair service

설치 프로그램이 쓴 systemd 유닛을 관리합니다. `systemctl`의 래퍼이므로 둘은 서로
바꿔 쓸 수 있고, 유닛을 다루는 명령을 나머지와 같은 자리에 두기 위해 존재합니다.

```bash
pingclair service <start|stop|restart|reload|status>
```

| 하위 명령 | 효과 |
| --- | --- |
| `start` | 유닛을 시작합니다. |
| `stop` | 유닛을 중지합니다. |
| `restart` | 유닛을 다시 시작합니다. 리스너나 프로세스 전역 옵션을 바꿨을 때 필요한 것입니다. |
| `reload` | 실행 중인 서버에 설정 파일을 다시 읽으라고 신호로 요청합니다. 결과는 유닛의 status line과 저널에 있고, 이 명령의 종료 코드에는 없습니다. |
| `status` | 유닛의 상태를 출력합니다. |

systemd가 있는 Linux 전용입니다. 다른 플랫폼에서는 이 명령이 흉내 내지 않고
거부하며, 유닛 자체의 설명은 [서비스로 실행](/ko/start/service/)에 있습니다.

## 🧾 이 옵션들의 출처

명령줄은 서버 코드의 한 파일 `pingclair/src/cli/mod.rs`에 정의되어 있고, 위 페이지는
그 순서를 따릅니다. 각 `--help` 화면에 나오는 버전과 이 페이지를 대조한 버전은
같습니다. 명령의 플래그가 바뀌면 이 페이지도 함께 바뀝니다.
