---
title: 빠른 시작
h1_emoji: '🏃'
description: 첫 Pingclairfile을 작성하고 검증한 뒤 트래픽을 처리합니다.
---

이 페이지는 새로 설치한 상태에서 동작하는 서버까지 안내합니다. 먼저 8080번 포트에서 정적 사이트를 제공하고, 다음으로 리버스 프록시를 둡니다.

## 1. ✍️ 설정 작성

`Pingclairfile`이라는 파일을 만듭니다.

```caddyfile
localhost:8080 {
    file_server ./public
}
```

파일에는 site block이 하나뿐입니다. `localhost:8080`은 이 사이트가 응답하는 주소이고, `file_server`는 파일 제공을, `./public`은 파일을 읽을 디렉터리를 뜻하며 실행 시 작업 디렉터리를 기준으로 합니다.

## 2. ✅ 검증

```bash
pingclair validate
```

`validate`는 기본적으로 `./Pingclairfile`을 읽고 `./Caddyfile`도 감지합니다. 설정을 컴파일하고 인증서 경로 같은 의미 조건을 검사하며, 문제가 있으면 0이 아닌 코드로 종료합니다. 검증은 권고가 아닙니다. 검증에 실패한 설정은 실행되지 않습니다.

설정을 작성하는 동안에는 다음 두 명령도 유용합니다.

```bash
pingclair adapt --pretty   # 컴파일된 JSON 형식 출력
pingclair fmt --diff       # 서식 차이만 표시(파일은 쓰지 않음)
```

## 3. 🚀 실행

```bash
pingclair run Pingclairfile
```

프로세스는 열어 둔 listener를 기록하고, 종료 신호를 받을 때까지 요청을 처리합니다.

## 4. 🔍 확인

다른 터미널에서:

```bash
curl -i http://localhost:8080/
```

제공된 파일의 `ETag`와 `Last-Modified` 헤더와 함께 `200`이 돌아와야 합니다.

요청이 멈춘다면 시스템 프록시가 루프백 트래픽을 가로채는지 확인하고 `curl --noproxy '*'`로 다시 시도하십시오.

## 5. 🔁 애플리케이션 프록시

site block을 3000번 포트 백엔드로 전달하는 리버스 프록시로 바꿉니다.

```caddyfile
localhost:8080 {
    reverse_proxy localhost:3000
}
```

같은 명령으로 다시 검증하고 실행합니다. 이제 응답은 백엔드에서 옵니다. 여러 업스트림, 부하 분산 정책, 상태 확인, 실패 시 동작은 [`reverse_proxy`](/ko/reference/directives/#reverse_proxy)를 참고하십시오.

## 6. 🔒 TLS 종료

공개 도메인 이름은 인증서를 자동으로 발급받습니다.

```caddyfile
{
    email admin@example.com
}

example.com {
    reverse_proxy localhost:3000
}
```

자동 HTTPS는 사이트 주소가 공개 이름이고 ACME 챌린지가 서버에 도달할 수 있어야 하며, 보통 80번 포트를 뜻합니다. 사설 오리진에는 `tls internal`을 사용해 로컬 인증 기관에서 발급합니다. 클라이언트는 `$PINGCLAIR_TLS_STORE/internal/root.crt`에 있는 루트 인증서를 신뢰해야 합니다.

## 7. ⚙️ 서비스로 실행

설치 스크립트는 `systemd` 유닛을 만들고 `pc` 명령으로 관리할 수 있게 합니다.

```bash
pc service start
pc service status
pc service reload   # 재시작 없이 설정을 다시 읽음
```

## 🧭 다음 단계

- [설정 모델](/ko/concepts/configuration/)
- [아키텍처](/ko/concepts/architecture/)
- [지시어 목록](/ko/reference/directives/)
