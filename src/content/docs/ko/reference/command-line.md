---
title: 명령줄
h1_emoji: '⌨️'
description: pingclair의 모든 하위 명령과 플래그, 기본값, 전제 조건을 바이너리 자체의 --help 출력과 대조해 정리합니다.
---

Pingclair는 바이너리 하나입니다. 서버 실행부터 설정 검사까지 모든 작업이 이
바이너리의 하위 명령입니다.

```bash
pingclair <command> [<args…>]
```

꺾쇠괄호는 필수 값, 대괄호는 선택 값, `…`은 반복할 수 있는 값을 뜻합니다. 모든
명령은 `--help`에 응답하며, `pingclair help <command>`도 같은 내용을 출력합니다.
명령 없이 바이너리를 실행하면 명령 목록이 출력됩니다.

📌 이 페이지는 최신 공개 릴리스인 **v0.2.0-rc.3**을 설명합니다. 서버의 `main`
브랜치에만 있는 변경은 **다음 릴리스**로 표시합니다.

설치 프로그램은 바이너리를 `pc`로도 링크하므로, 아래의 모든 명령은 `pc validate`,
`pc service reload`처럼 두 글자로도 쓸 수 있습니다. 둘은 같은 프로그램입니다. `pc`는
두 번째 바이너리가 아니라 심볼릭 링크입니다.

## 🚩 전역 플래그

| 플래그 | 하는 일 |
| --- | --- |
| `-v`, `--verbose` | 이번 실행의 로그 수준을 `debug`로 올립니다. 명령 앞뒤 어디에 써도 됩니다. `caddy -v`와 달리 버전을 출력하지 않습니다. |
| `-h`, `--help` | 붙은 명령의 도움말을 출력합니다. |
| `-V`, `--version` | 버전을 출력합니다. 최상위에서만 씁니다. |

## 🧭 명령 한눈에 보기

| 명령 | 하는 일 |
| --- | --- |
| `run` | 서버를 포그라운드로 실행합니다. |
| `reload` | 수정한 설정을 Admin API로 적용하고, 서버의 판단을 보고합니다. |
| `start` | 분리된 서버 프로세스를 시작합니다. |
| `stop` | 실행 중인 서버를 Admin API로 중지합니다. |
| `completion` | 셸 자동 완성 스크립트를 출력합니다. |
| `environ` | 서버가 보게 될 환경 변수를 출력합니다. |
| `list-modules` | 이 바이너리에 컴파일된 모듈을 나열합니다. |
| `build-info` | 툴체인을 포함한 빌드 메타데이터를 출력합니다. |
| `manpage` | 디렉터리에 man 페이지를 씁니다. |
| `storage-export` | 인증서 저장소를 tar 아카이브로 씁니다. |
| `storage-import` | 그 tarball에서 인증서 저장소를 복원합니다. |
| `trust` | 내부 CA 루트를 시스템 신뢰 저장소에 설치합니다. |
| `untrust` | 그것을 다시 제거합니다. |
| `respond` | 개발용으로 고정된 응답을 제공합니다. |
| `reverse-proxy` | 설정 파일 없이 업스트림으로 프록시합니다. |
| `file-server` | 설정 파일 없이 디렉터리를 서비스합니다. |
| `validate` | 설정을 컴파일하고 무엇이 잘못되었는지 보고합니다. |
| `adapt` | Pingclairfile의 컴파일된 JSON 형식을 출력합니다. |
| `fmt` | Pingclairfile을 정리하거나, 정리하면 무엇이 바뀌는지 보여 줍니다. |
| `hash-password` | `basic_auth`용 비밀번호 해시를 만듭니다. |
| `version` | 버전을 출력합니다. |
| `service` | 설치된 systemd 유닛을 제어합니다. |

**다음 릴리스**: `storage-export`와 `storage-import`의 Caddy식 표기인
`storage export`와 `storage import`가 추가됩니다. 하이픈이 들어간 이름도 계속
동작합니다.

## pingclair run

설정 문서 하나로 서버를 포그라운드에서 실행합니다. 로그는 표준 출력과 표준 오류로
나가며, `Ctrl-C`로 서버를 종료합니다.

```bash
pingclair run [OPTIONS] [CONFIG]
```

| 인자 | 기본값 | 하는 일 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, 그다음 `./Caddyfile` | 로드할 설정 파일 또는 디렉터리입니다. |

| 플래그 | 하는 일 |
| --- | --- |
| `-r`, `--resume` | `caddy run --resume`처럼 파일 대신 Admin API가 마지막으로 자동 저장한 설정을 로드합니다. 둘 다 있으면 `CONFIG`보다 우선합니다. |
| `-w`, `--watch` | 설정 파일의 수정 시각을 1초마다 확인하고, 바뀔 때마다 리로드합니다. 로컬 개발용입니다. |

```bash
pingclair run --watch
```

`CONFIG`가 없고 기본 파일도 둘 다 없으면 `run`은 상태 1로 종료합니다. Caddy는 이때
빈 서버를 시작하지만 Pingclair는 거부하므로, 잘못된 디렉터리에서 입력한 `run`은
눈에 띄게 실패합니다.

터미널보다 오래 살아야 하는 서버에는 설치된 유닛을 씁니다
([서비스로 실행하기](/ko/start/service/)).

## pingclair reload

설정 파일을 Admin API(`POST /load`)로 실행 중인 서버에 보냅니다. 서버가 요청에 직접
응답하므로, 이 명령은 파일이 적용되었는지를 보고합니다. 신호로는 이것이 불가능합니다.
systemd는 신호가 전달되었다는 것만 확인할 수 있습니다.

```bash
pingclair reload [OPTIONS]
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, 그다음 `./Caddyfile` | 적용할 설정 파일입니다. |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 주소입니다. |

실행 중인 설정이 전역 `admin` 옵션으로 Admin API를 켜 두어야 합니다. 그렇지 않으면
접속할 곳이 없습니다. 서버가 새 파일을 적용할 수 없으면(대개 리스너를 추가하거나
옮긴 경우) 명령은 실패하고 이전 설정이 계속 서비스됩니다.

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

서비스 관리자 없이, 셸이 종료된 뒤에도 계속 실행되는 백그라운드 프로세스로 서버를
시작합니다.

```bash
pingclair start [OPTIONS]
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, 그다음 `./Caddyfile` | 로드할 설정 파일입니다. |

프로세스는 터미널에서 분리되고 출력은 버려지므로 로그가 어디에도 남지 않습니다.
systemd가 있는 호스트에서는 설치된 유닛이 더 나은 도구입니다. 로그를 수집하고, 실패하면
재시작하고, 리스너가 언제 바인딩되었는지 압니다.
[서비스로 실행하기](/ko/start/service/)를 참고합니다.

## pingclair stop

Admin API의 `POST /stop`으로 실행 중인 서버를 중지합니다. `reload`와 마찬가지로 실행
중인 설정에 `admin` 옵션이 필요합니다.

```bash
pingclair stop [OPTIONS]
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Admin API 주소입니다. |

## pingclair completion

셸 하나에 대한 자동 완성 스크립트를 출력합니다. 지원하는 이름은 인자가 받는 것과
정확히 같습니다. `bash`, `zsh`, `fish`, `powershell`, `elvish`입니다.

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

이 프로세스가 물려받은 환경 변수를 한 줄에 하나씩 `NAME=value`로 출력합니다. 시작
전에 `PINGCLAIR_TLS_STORE` 같은 값을 확인할 수 있습니다. `caddy environ`과 달리
서버가 계산한 경로는 출력하지 않습니다.

```bash
pingclair environ
```

## pingclair list-modules

이 바이너리에 컴파일된 모듈을 나열합니다. `--json`은 스크립트용으로 같은 목록을
JSON으로 출력합니다.

**다음 릴리스**: `--versions`, `--packages`, `-s`/`--skip-standard`를 받으므로,
`caddy list-modules`용으로 작성한 스크립트가 그대로 동작합니다.

```bash
pingclair list-modules [--json]
```

## pingclair build-info

빌드 메타데이터, 즉 버전, 타깃, 바이너리를 만든 툴체인을 출력합니다. 정확한 빌드를
밝혀 주므로 결함을 보고할 때 유용합니다.

```bash
pingclair build-info
```

## pingclair manpage

이미 존재하는 디렉터리에 man 페이지를 씁니다. 플래그가 필수이므로 실수로 현재
디렉터리에 무언가가 쓰이는 일은 없습니다.

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

인증서 저장소를 tar 아카이브로 씁니다. 대상 저장소는 `PINGCLAIR_TLS_STORE`가
지정한 곳이며, 없으면 명령을 실행한 사용자의 데이터 디렉터리입니다. 예시의 접두사는
root 셸이 root 자신의 저장소 대신 서비스 계정의 저장소를 가리키게 합니다. `-o -`는
아카이브를 표준 출력으로 씁니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

아카이브에는 개인 키가 들어 있으므로 권한 `600`으로 기록되며, 버킷으로 전송되는
백업이 아니라 암호화된 매체에 보관해야 합니다. 무엇이 들어 있고 언제 옮기는지는
[TLS 가이드](/ko/guides/tls-tuning/)에서 다룹니다.

## pingclair storage-import

`storage-export`가 쓴 아카이브에서 저장소를 복원합니다. `-i -`는 표준 입력에서
아카이브를 읽습니다.

**다음 릴리스**: 두 명령 모두 `-c`/`--config <file>`을 받으며, 그 파일의 전역
`storage file_system <path>` 옵션이 저장소를 지정합니다. 아무것도 복원하지 않을
가져오기는 거부됩니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

내부 인증 기관(`tls internal`)의 루트 인증서를 시스템 신뢰 저장소에 설치합니다.
이후 그 저장소를 쓰는 클라이언트는 이 인증 기관이 발급한 인증서를 받아들입니다.
루트는 `PINGCLAIR_TLS_STORE`가 지정한 저장소에서 읽습니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

언제 필요한지, 제대로 되었는지 확인하는 방법은 [HTTPS](/ko/start/https/) 페이지에
있습니다.

## pingclair untrust

그 루트 인증서를 시스템 신뢰 저장소에서 제거합니다. 발급된 인증서는 디스크에
남지만 클라이언트는 더 이상 신뢰하지 않습니다.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

모든 요청에 고정된 응답 하나(상태, 헤더, 본문)를 제공합니다. 개발용이며, 항상 같은
방식으로 응답하는 오리진에 대해 클라이언트를 시험할 때 씁니다.

```bash
pingclair respond [OPTIONS]
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | 반환할 상태 코드입니다. |
| `-H`, `--header <HEADERS>` | 없음 | `Field: value` 형식의 응답 헤더입니다. 반복할 수 있습니다. |
| `-b`, `--body <BODY>` | 비어 있음 | 응답 본문입니다. |
| `-l`, `--listen <LISTEN>` | 임의의 루프백 포트 | 리스너 주소입니다. |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

`--listen`이 없으면 비어 있는 루프백 포트를 골라 출력하므로, 두 개발 서버가 한 포트를
두고 다투는 일이 없습니다.

## pingclair reverse-proxy

설정 파일 없이 리스너를 하나 이상의 업스트림으로 프록시합니다. `--to`는 필수이며,
반복하면 요청을 여러 업스트림에 나눕니다. 설정 파일로 같은 내용을 다루는 것은
[리버스 프록시 가이드](/ko/guides/reverse-proxy/)입니다.

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | 수신할 주소입니다. |
| `--to <TO>` | 필수 | 업스트림 주소입니다. 여러 개면 반복합니다. |
| `--header-up <HEADERS_UP>` | 없음 | 업스트림으로 보낼 `Field: value` 형식의 요청 헤더입니다. 반복할 수 있습니다. |
| `--header-down <HEADERS_DOWN>` | 없음 | 다운스트림으로 보낼 `Field: value` 형식의 응답 헤더입니다. 반복할 수 있습니다. |
| `--insecure` | 꺼짐 | 업스트림의 TLS 인증서를 검증하지 않습니다. |
| `--internal-certs` | 꺼짐 | 공개 인증서를 시도하지 않고 이 리스너의 인증서를 내부 CA에서 발급합니다. |
| `--disable-redirects` | 꺼짐 | HTTP에서 HTTPS로 리디렉션하는 리스너를 만들지 않습니다. |
| `-c`, `--change-host-header` | 꺼짐 | Caddy처럼 업스트림 `Host` 헤더를 업스트림 주소로 바꿉니다. |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

설정 파일 없이 디렉터리를 HTTP로 서비스합니다.

```bash
pingclair file-server [OPTIONS]
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | 수신할 주소입니다. |
| `--root <ROOT>` | `.` | 서비스할 디렉터리입니다. |
| `-b`, `--browse` | 꺼짐 | 디렉터리 목록을 보여 줍니다. |
| `-d`, `--domain <DOMAIN>` | 없음 | 이 도메인을 HTTPS로 서비스합니다. `--listen`이 포트여야 합니다. |
| `--access-log` | 꺼짐 | 요청마다 액세스 로그 한 줄을 씁니다. |
| `--no-compress` | 꺼짐 | 응답 압축을 끕니다. |
| `--file-limit <FILE_LIMIT>` | 없음 | 디렉터리 목록에 표시할 최대 파일 수입니다. |
| `--templates` | 꺼짐 | Caddy처럼 `.html` 파일을 템플릿으로 렌더링합니다. |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

압축, 캐시 헤더, 싱글 페이지 애플리케이션 폴백은 설정 파일에서 다룹니다.
[정적 사이트 가이드](/ko/guides/static-site/)를 참고합니다.

## pingclair validate

아무것도 시작하지 않고 설정을 컴파일해 처음 발견한 문제를 보고합니다. 설정이
거부되면 종료 상태가 0이 아니므로, 배포 스크립트의 관문으로 쓸 수 있습니다.

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| 인자 | 기본값 | 하는 일 |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, 그다음 `./Caddyfile` | 검사할 설정 파일 또는 디렉터리입니다. |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

Pingclairfile이 컴파일된 JSON 문서를 출력합니다. `validate`, `run`, Admin API의
`/load`가 받아들이는 Pingclair 자체의 스키마입니다. `caddy adapt`와 달리 출력은
Caddy의 `{"apps": …}` 형태가 아니며, Caddy는 이것을 로드할 수 없습니다.

`--pretty`는 JSON을 들여 씁니다. `--validate`는 인증서 파일의 존재 여부처럼
`validate`가 실행하는 검사도 함께 실행합니다.

**다음 릴리스**: `adapt`는 출력하기 전에 항상 검증하므로, 종료 상태 0은 이 빌드가
결과를 로드할 수 있다는 뜻입니다. `--validate`는 여전히 받아들이지만 아무것도 바꾸지
않습니다.

```bash
pingclair adapt [OPTIONS]
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, 그다음 `./Caddyfile` | 읽을 설정 파일입니다. |
| `-p`, `--pretty` | 꺼짐 | JSON을 들여 씁니다. |
| `--validate` | 꺼짐 | `validate`가 실행하는 검사도 실행합니다. |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Pingclairfile을 정리해 결과를 출력합니다. 경로가 없으면 `./Pingclairfile`을 읽고,
`-`는 표준 입력을 읽습니다.

**다음 릴리스**: 입력이 이미 정리된 상태가 아니면 `fmt`는 상태 1로 종료하므로,
`caddy fmt`처럼 커밋의 관문으로 쓸 수 있습니다. `--overwrite`는 여전히 0으로
종료합니다. Caddy식 표기인 `--config <path>`와 `-w`를 받으며, 들여쓰기는 두 칸
대신 단계마다 탭 하나가 됩니다.

```bash
pingclair fmt [OPTIONS] [PATH]
```

| 플래그 | 하는 일 |
| --- | --- |
| `-o`, `--overwrite` | 정리한 내용을 출력하지 않고 파일에 다시 씁니다. |
| `-d`, `--diff` | 정리된 파일 대신 시각적 diff를 출력합니다. |

```bash
pingclair fmt --diff              # what would change
pingclair fmt --overwrite         # apply it
```

## pingclair hash-password

`basic_auth` 디렉티브용 비밀번호 해시를 만듭니다. `--plaintext`를 생략하면 비밀번호를
표준 입력에서 읽으므로 셸 기록에 남지 않습니다.

```bash
pingclair hash-password [OPTIONS]
```

| 플래그 | 기본값 | 하는 일 |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | 표준 입력에서 읽음 | 해시할 비밀번호입니다. |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` 또는 `argon2id`입니다. |
| `--bcrypt-cost <COST>` | `14` | bcrypt 비용, 4~31입니다. 높을수록 느리고 강합니다. |
| `--argon2id-time <TIME>` | `1` | argon2id 반복 횟수입니다. |
| `--argon2id-memory <MEMORY>` | `65536` | argon2id 메모리 비용(KiB)입니다. |
| `--argon2id-threads <THREADS>` | `4` | argon2id 병렬도입니다. |
| `--argon2id-keylen <KEYLEN>` | `32` | argon2id 출력 길이(바이트)입니다. |

```bash
pingclair hash-password --algorithm argon2id
```

출력을 디렉티브에 붙여 넣습니다. 주변 구문은
[`basic_auth` 항목](/ko/reference/directives/#basic_auth)에 있습니다.

## pingclair version

버전을 출력합니다. 릴리스 후보라면 `v0.2.0-rc.3`처럼 출력됩니다.

```bash
pingclair version
```

## pingclair service

설치 프로그램이 쓴 systemd 유닛을 제어합니다. `systemctl`을 감싼 것이므로 어느
쪽을 써도 되며, 이 하위 명령은 유닛 관련 명령을 다른 명령과 한곳에 모아 둡니다.

```bash
pingclair service <start|stop|restart|reload|status>
```

| 하위 명령 | 하는 일 |
| --- | --- |
| `start` | 유닛을 시작합니다. |
| `stop` | 유닛을 중지합니다. |
| `restart` | 유닛을 재시작합니다. 리스너나 프로세스 전체에 걸친 옵션을 바꿨을 때 필요합니다. |
| `reload` | 실행 중인 서버에 신호를 보내 설정 파일을 다시 읽게 합니다. 결과는 이 명령의 종료 코드가 아니라 유닛의 상태 줄과 저널에 남습니다. |
| `status` | 유닛의 상태를 출력합니다. |

systemd가 있는 Linux에서만 동작하며, 다른 플랫폼에서는 실행을 거부합니다. 유닛
자체는 [서비스로 실행하기](/ko/start/service/)에서 설명합니다.

## 🧾 이 옵션들의 출처

명령줄은 서버 소스의 파일 하나, `pingclair/src/cli/mod.rs`에 정의되어 있으며, 이
페이지는 그 순서를 따릅니다. 그곳에서 명령의 플래그가 바뀌면 이 페이지도 함께
바뀝니다.
