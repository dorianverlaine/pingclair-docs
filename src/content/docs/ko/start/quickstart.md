---
title: 퀵스타트
h1_emoji: '🏃'
sidebar:
  order: 2
description: 첫 Pingclairfile을 작성하고 검증한 뒤 포그라운드 또는 백그라운드로 실행해 실제 디렉터리를 서비스합니다.
---

이 페이지는 설치가 끝난 호스트에서 직접 제어하는 서버까지 진행합니다. 디스크 위의
설정, 검증된 컴파일, 시작·중지·감시할 수 있는 서버, 그리고 파일 서버가 응답했다는
확인입니다. [설치](/ko/start/install/)가 끝났다고 가정합니다.

## 🧾 시작하기 전에

설치 프로그램은 80 포트에서 서비스를 돌린 채로 남겨 두었고, 그 서비스가
`/etc/Pingclair/Pingclairfile` 설정을 쥐고 있습니다. 실험하는 동안에는 중지해서
포트를 비웁니다.

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

세 가지만 짚어 둡니다. 맨 위의 이름 없는 블록은 전역 옵션이고, `admin`이 있으면
`pingclair start`, `stop`, `reload`가 실행 중인 서버와 통신할 수 있습니다.
사이트 주소에는 스킴이 들어가고, `http://`가 평문을 강제합니다. 이게 없으면
Pingclair는 `localhost`를 이름으로 취급해 자체 인증 기관으로 HTTPS를 제공하며,
평문 HTTP 클라이언트에게는 빈 응답으로 보입니다([HTTPS](/ko/start/https/)).
`file_server`의 루트는 작업 디렉터리 기준 상대 경로입니다.

## 2. ✅ 실행 전에 검증하기

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate`는 기본적으로 `./Pingclairfile`을 읽고 `./Caddyfile`도 감지합니다.
설정을 컴파일하고 인증서 경로 존재 여부 같은 의미 검사를 적용합니다. 검증은
권고가 아닙니다. 실패한 설정은 실행되지 않고, 마지막 줄에 이유가 나옵니다.

## 3. 🧭 설정이 무엇이 되는지 보기

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

컴파일된 JSON은 서버가 실제로 실행하는 형태입니다. 지시어가 문서대로 동작하지
않을 때 가장 먼저 볼 곳입니다. 대신 `pingclair fmt`가 파일에 가할 변경을 보려면
다음과 같이 합니다.

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt`는 정규형을 출력하며, 들여쓰기는 두 칸이 됩니다.

## 4. 🚀 실행하기

로그가 터미널에 남는 포그라운드로 실행합니다.

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

`--watch`를 붙이면 저장할 때마다 설정이 다시 읽혀 개발 루프가 됩니다.

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

셸에서 분리해 백그라운드로 돌릴 수도 있습니다.

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`, `stop`, `reload`는 Admin API를 통해 실행 중인 서버에
도달합니다. 위 설정에 `admin`이 있는 이유입니다. `pingclair run`에는 필요하지
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

`ETag`와 `Last-Modified`는 파일 서버가 디스크에서 읽었다는 증거입니다. 본문은
`public/index.html`입니다. 백그라운드 서버를 멈추려면 다음과 같이 합니다.

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ 명령 하나로 띄우는 서버

세 하위 명령은 설정 파일 없이 서비스합니다. 시험해 보거나 일회성 호스트에서
유용합니다.

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

각각 시작할 때 리스너를 출력합니다.

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

`:8082`로 온 요청은 `:8081`의 파일 서버로 전달되고, `:8083`은 넘긴 본문을 그대로
돌려줍니다. `respond`는 개발 전용입니다.

## 🔁 서비스에 맡기기

서비스는 `/etc/Pingclair/Pingclairfile`을 실행하므로, 그곳에 두어야 재부팅 후에도
살아남습니다.

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

먼저 검증하십시오. `pc service reload`가 성공을 알리는 것은 신호가 전달됐을
때이지 서버가 설정을 받아들였을 때가 아닙니다. 설정을 거부한 서버는 거부를
로그에 남기지 않고 이전 설정을 계속 실행합니다. 진실을 알려 주는 것은 검증
명령뿐입니다.

## ⚠️ 잘 되지 않을 때

- **`Address already in use`.** 설치 프로그램의 서비스가 아직 `:80`을 잡고
  있거나 다른 프로세스가 그 포트를 잡고 있습니다. `sudo ss -ltnp | grep :80`이
  주인을 보여 주고, `sudo pc service stop`이 기본 서비스를 풀어 줍니다.
- **`http://localhost:8080`에서 `Empty reply from server`.** 평문으로 TLS
  리스너에 말하고 있습니다. 사이트 주소에 `http://`를 붙이거나, 내부 인증서를
  신뢰한 뒤 `https://`로 통신하십시오.
- **`Cannot reach admin API at 127.0.0.1:2019`.** 설정에 `admin`이 없어
  `pingclair stop`과 `pingclair reload`를 받아 줄 대상이 없습니다. 전역 옵션
  블록에 추가하거나 포그라운드 프로세스를 Ctrl-C로 멈추십시오.
- **`curl`이 루프백에서 멈춤.** 시스템 프록시가 요청을 가로채고 있습니다.
  `curl --noproxy '*'`로 다시 실행하십시오.
- **검증이 `Unsupported feature`로 실패.** 지시어는 인식되지만 구현이 없고,
  메시지가 대안을 알려 줍니다. `encode br`의 경우 프록시 응답에 Brotli가
  구현되어 있지 않아 `encode zstd gzip`을 가리킵니다.

## 🧭 다음 단계

- [HTTPS](/ko/start/https/): 공개 이름을 위한 인증서를 Let's Encrypt 또는 내부
  인증 기관에서.
- [서비스로 실행](/ko/start/service/): 유닛, 재적용의 의미, 로그.
- [Pingclairfile](/ko/reference/pingclairfile/): 언어 자체. 매처, 스니펫,
  임포트.
