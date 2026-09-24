---
title: 빠른 시작
h1_emoji: '🏃'
sidebar:
  order: 2
description: 첫 Pingclairfile을 작성하고 검증한 뒤, 포그라운드나 백그라운드로 실행해 실제 디렉터리를 서비스합니다.
---

이 페이지는 설치를 마친 호스트에서 출발해 직접 다룰 수 있는 서버를 띄우는 데까지
안내합니다. 디스크에 설정을 두고, 컴파일이 통과하는지 검증하고, 서버를 시작·중지하며
지켜본 뒤, 파일 서버가 실제로 응답했는지 확인합니다. [설치](/ko/start/install/)는
이미 끝났다고 가정합니다.

## 🧾 시작하기 전에

설치 프로그램은 80번 포트에서 서비스를 실행해 둔 상태이며, 이 서비스는
`/etc/Pingclair/Pingclairfile` 설정을 사용합니다. 실험하는 동안 포트가 비도록
서비스를 중지합니다.

```bash
sudo pc service stop
```

```bash
mkdir -p ~/demo/public
cd ~/demo
echo '<h1>hello from ~/demo/public</h1>' > public/index.html
```

## 1. ✍️ 설정 작성하기

`~/demo/Pingclairfile`을 만듭니다.

```caddyfile
{
    admin 127.0.0.1:2019
}

http://localhost:8080 {
    file_server ./public
}
```

여기서 눈여겨볼 점은 세 가지입니다.

- 맨 위의 이름 없는 블록에는 전역 옵션이 들어갑니다. `admin`은 Admin API를
  엽니다. `pingclair start`, `stop`, `reload`는 이 API를 통해 실행 중인 서버에
  접근합니다.
- 사이트 주소의 `http://` 스킴은 평문 HTTP를 강제합니다. 스킴이 없으면
  Pingclair는 `localhost`를 이름으로 취급해 자체 인증 기관이 발급한 인증서로
  HTTPS를 서비스하며, 평문 HTTP 클라이언트는 빈 응답을 받게 됩니다
  ([HTTPS](/ko/start/https/)).
- `file_server`의 루트 경로는 작업 디렉터리를 기준으로 합니다.

## 2. ✅ 실행 전에 검증하기

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate`는 기본적으로 `./Pingclairfile`을 읽으며 `./Caddyfile`도 찾아냅니다.
설정을 컴파일하고, 인증서 경로가 실제로 존재하는지 같은 의미 검사도 수행합니다.
검증은 참고용이 아닙니다. 검증에 실패한 설정은 실행되지 않으며, 실패 이유는 출력의
마지막 줄에 표시됩니다.

## 3. 🧭 설정이 무엇으로 바뀌는지 보기

```bash
pingclair adapt --pretty
```

```text
{
  "debug": false,
  "servers": [
    {
      "name": "localhost",
      "names": [
        "localhost"
      ],
      "listen": [
        "[::]:8080"
      ],
```

컴파일된 JSON이 서버가 실제로 실행하는 형태입니다. 디렉티브가 문서와 다르게
동작한다면 가장 먼저 이곳을 확인합니다. 반대로 `pingclair fmt`가 파일을 어떻게
고칠지 보려면 다음을 실행합니다.

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt`는 두 칸 들여쓰기를 쓰는 정규 형식을 출력합니다.

## 4. 🚀 실행하기

포그라운드로 실행하면 로그가 터미널에 그대로 표시됩니다.

```bash
pingclair run Pingclairfile
```

```text
🚀 Starting Pingclair with config: Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: Pingclairfile
🔧 Configured 1 server(s)
🔐 Auto HTTPS: enabled
```

`--watch`를 붙이면 파일을 저장할 때마다 설정을 다시 읽습니다. 개발할 때 쓰는
방식입니다.

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

셸을 닫아도 계속 돌아가도록 백그라운드로 실행할 수도 있습니다.

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`, `stop`, `reload`는 Admin API를 통해 실행 중인 서버에
접근합니다. 위 설정에 `admin`을 넣은 이유가 이것입니다. `pingclair run`에는 필요하지
않습니다.

## 5. 🔍 확인하기

```bash
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 34
Last-Modified: Tue, 22 Sep 2026 03:26:39 GMT
ETag: "22-6ab1f56f"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag`와 `Last-Modified`가 있다는 것은 파일 서버가 디스크에서 파일을 읽었다는
뜻입니다. 본문은 `public/index.html`입니다. 백그라운드 서버는 다음과 같이
중지합니다.

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ 명령 하나로 띄우는 서버

다음 세 하위 명령은 설정 파일 없이 서비스를 시작합니다. 무언가를 잠깐 시험하거나
일회용 호스트에 쓰기 좋습니다.

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

각 명령은 시작할 때 리스너를 출력합니다.

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

`:8082`로 들어온 요청은 모두 `:8081`의 파일 서버로 프록시되고, `:8083`은 넘겨준
본문으로 응답합니다. `respond`는 개발용입니다.

## 🔁 서비스로 옮기기

서비스는 `/etc/Pingclair/Pingclairfile`을 실행하므로, 설정을 이 위치에 두어야
재부팅 후에도 유지됩니다.

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

`pc service reload`는 실행 중인 서버에 파일을 다시 읽으라고 요청하며, 유닛은
`SIGUSR1`을 보내 이를 처리합니다. `pingclair reload`는 Admin API를 거쳐 같은
코드에 도달하고, 서버가 파일을 어떻게 판단했는지도 알려 줍니다. 이 명령에는 전역
옵션 블록의 `admin` 옵션이 필요합니다.
`sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"`는 둘 다 없이 같은
일을 합니다.

어느 방법이든 먼저 검증하고, 결과는 나중에 확인합니다. `systemctl reload`는 신호가
전달되었다는 사실만 보고합니다. 서버의 판정, 즉 적용되었는지 아니면 이유와 함께
거부되었는지는 유닛의 상태 줄과 저널에 남습니다. 리로드가 거부되면 이전 설정이 계속
서비스되며, 거부하는 목적이 바로 그것입니다. 자세한 내용은
[서비스로 실행하기](/ko/start/service/#-리로드의-의미)에 있습니다.

## ⚠️ 잘 되지 않을 때

- **`Address already in use`.** 설치 프로그램의 서비스가 아직 `:80`을 쓰고 있거나,
  다른 프로세스가 해당 포트를 쓰고 있습니다. `sudo ss -ltnp | grep :80`으로 누가
  쓰는지 확인할 수 있고, 기본 서비스는 `sudo pc service stop`으로 포트를 비웁니다.
- **`http://localhost:8080`에서 `Empty reply from server`.** TLS 리스너에 평문으로
  말을 걸고 있습니다. 사이트 주소에 `http://` 스킴을 붙이거나, `https://`로 접속하고
  내부 인증서를 신뢰하도록 설정합니다.
- **`Cannot reach admin API at 127.0.0.1:2019`.** 설정에 `admin` 옵션이 없어서
  `pingclair stop`과 `pingclair reload`를 받을 곳이 없습니다. 전역 옵션 블록에
  추가하거나, 포그라운드 프로세스를 Ctrl-C로 중지합니다.
- **루프백 주소에서 `curl`이 멈춥니다.** 시스템 프록시가 요청을 가로채고 있습니다.
  `curl --noproxy '*'`로 다시 시도합니다.
- **검증이 `Unsupported feature`로 실패합니다.** 디렉티브를 인식은 하지만 구현되어
  있지 않다는 뜻이며, 메시지가 대안을 알려 줍니다. 예를 들어 `encode br`의 경우
  프록시 응답에 Brotli가 구현되어 있지 않으므로 메시지가 `encode zstd gzip`을
  안내합니다.

## 🧭 다음 단계

- [HTTPS](/ko/start/https/): Let's Encrypt나 내부 인증 기관에서 공개 이름용
  인증서를 받습니다.
- [서비스로 실행하기](/ko/start/service/): 유닛, 리로드 방식, 로그를 다룹니다.
- [Pingclairfile](/ko/reference/pingclairfile/): 매처, 스니펫, import를 포함한 설정
  언어 자체를 설명합니다.
