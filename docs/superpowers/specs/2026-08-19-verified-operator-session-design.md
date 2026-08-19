# DEXCOWIN MES 검증된 작업자 세션 설계

- 상태: 사용자 승인 설계
- 결정일: 2026-08-19
- 대상 카드: `IC-01`
- 구현 전제: `codex/full-code-quality-improvement` 로컬 브랜치에서만 작업하며 푸시하지 않는다.

## 1. 목적

DEXCOWIN MES의 재고 변경 요청이 화면의 `sessionStorage`, 요청 body, 또는 `X-MES-Employee-Code` 헤더가 주장하는 직원이 아니라 **서버가 PIN으로 검증하고 DB 세션에서 복원한 작업자**에 의해 실행되도록 만든다.

이 설계가 보장하려는 것은 다음 세 가지다.

1. 재고를 바꾼 실제 로그인 작업자와 감사 로그의 행위자가 일치한다.
2. 기본 PIN `0000` 상태의 직원은 새 PIN을 정하기 전까지 재고 작업을 할 수 없다.
3. 로그아웃, PIN 변경·초기화, 직원 비활성화·삭제, 서버 재시작 뒤에는 기존 세션으로 작업할 수 없다.

현재 사내 LAN은 HTTP이므로 이 설계만으로 네트워크 도청·쿠키 탈취를 막았다고 주장하지 않는다. HTTPS는 별도 후속 보안 작업으로 남기며, HTTPS 적용 전에는 인터넷이나 신뢰할 수 없는 LAN에 시스템을 노출하지 않는다.

## 2. 현재 문제

현재 로그인은 `POST /api/employees/{employee_id}/verify-pin` 성공 후 직원 정보를 브라우저 `sessionStorage`에 저장한다. 일부 요청은 이 값으로 만든 `X-MES-Employee-Code` 또는 body의 직원 ID를 서버에 전달한다. 서버는 PIN 성공 시 서명된 감사용 쿠키를 발급하지만, 이 쿠키는 DB 세션·직원 활성 상태·PIN 변경·서버 재시작과 결합된 권한 경계가 아니다.

따라서 화면 값이나 헤더를 바꾼 요청이 업무 행위자와 분리될 수 있고, 감사용 식별과 실제 mutation 권한의 정본이 다르다. 현재 PIN 해시는 salt 없는 SHA-256이며 `None`도 기본 PIN `0000`으로 취급한다. 이는 작업자 식별 보조 수단으로는 동작하지만 재고 변경 권한의 인증 수단으로는 충분하지 않다.

## 3. 결정과 대안

### 선택: DB-backed opaque session

서버가 무작위 세션 토큰을 발급하고, 브라우저에는 HttpOnly 쿠키로 원문 토큰만 저장한다. DB에는 토큰의 SHA-256 digest와 세션 상태를 저장한다. 모든 mutation은 공통 `VerifiedActor` 의존성으로 세션을 검증한 뒤 실행한다.

이 방식을 선택한 이유는 다음과 같다.

- 로그아웃, PIN 변경, 직원 비활성화 시 즉시 폐기할 수 있다.
- 12시간 만료와 서버 재시작 폐기를 DB에서 명시적으로 검증할 수 있다.
- 브라우저가 주장한 직원과 서버가 복원한 직원의 불일치를 일관되게 거부할 수 있다.
- SQLite와 PostgreSQL에서 동일한 업무 계약을 테스트할 수 있다.

### 채택하지 않은 대안

1. **현재 서명 쿠키 확장:** DB 조회 없이 가볍지만 직원 비활성화·PIN 변경·즉시 로그아웃을 안정적으로 반영하기 어렵다.
2. **JWT:** 현재 단일 사내 시스템에는 키 회전·revocation 목록·클레임 호환 관리가 불필요하게 복잡하다.
3. **브라우저 저장값 유지:** 구현량은 가장 작지만 이번 작업의 핵심인 서버 검증 행위자 경계를 만들지 못한다.

## 4. 신뢰 경계

### 서버가 신뢰하는 값

- HttpOnly 쿠키의 opaque 세션 토큰
- DB의 세션 행과 연결된 활성 직원
- 서버가 생성한 `boot_id`
- mutation 처리 시 `VerifiedActor`가 반환한 `Employee`

### 서버가 권한 근거로 신뢰하지 않는 값

- `sessionStorage`·`localStorage`의 작업자 정보
- `X-MES-Employee-Code`
- body/query/path의 `employee_id`, `requester_id`, `actor`, `produced_by`
- 클라이언트가 만든 감사 session ID

이 값들은 업무 대상이나 화면 표시·상관관계 정보로는 남길 수 있다. 단, 세션 행위자와 다른 직원을 행위자로 주장하면 `403 ACTOR_MISMATCH`로 거부한다. 접근 로그는 미검증 헤더를 보조 필드로 기록할 수 있지만 이를 `verified_actor`와 같은 필드에 섞지 않는다.

### 추가 PIN의 역할

관리자 PIN, 창고 책임자 PIN, 인수인계 등 현재 민감 작업의 추가 PIN 확인은 step-up 검증으로 유지한다. step-up PIN은 작업 권한을 추가 확인할 뿐 행위자의 신원을 대체하지 않는다.

예를 들어 관리자 재고 복구는 다음 두 조건을 모두 만족해야 한다.

1. 유효한 직원 세션의 `VerifiedActor`
2. 기존 관리자 PIN step-up

## 5. 데이터 모델

### `operator_sessions`

| 필드 | 계약 |
|---|---|
| `session_id` | UUID primary key |
| `token_hash` | 원문 토큰의 SHA-256 hex digest, unique, nullable false |
| `employee_id` | `employees.employee_id` FK, nullable false |
| `purpose` | `operator` 또는 `pin_change`; `VerifiedActor`는 `operator`만 허용 |
| `issued_at` | UTC 발급 시각 |
| `expires_at` | UTC 절대 만료 시각, `issued_at + 12시간` |
| `revoked_at` | UTC 폐기 시각, 활성 세션은 null |
| `consumed_at` | 1회성 `pin_change` 사용 완료 시각, 작업자 세션은 null |
| `boot_id` | 세션을 발급한 서버 boot identity |

인덱스는 `token_hash` unique, `(employee_id, purpose, revoked_at)`, `expires_at`을 둔다. 토큰은 CSPRNG로 만든 최소 32바이트 URL-safe 값이며 원문을 DB나 로그에 기록하지 않는다. 같은 직원의 여러 브라우저에 복수 작업자 세션을 허용하되 PIN 변경·초기화·비활성화는 전부 한꺼번에 폐기한다.

### `employees.pin_requires_change`

salt가 있는 새 해시는 기본 PIN 해시와 단순 비교할 수 없으므로 `pin_requires_change` boolean을 명시적으로 추가한다.

- 신규 직원: `true`
- 관리자 PIN 초기화: `true`
- 직원이 기본 PIN과 다른 새 PIN을 설정한 뒤: `false`
- 마이그레이션 시 `pin_hash IS NULL` 또는 기존 `0000` SHA-256: `true`
- 마이그레이션 시 그 밖의 기존 해시: `false`

API의 `pin_is_default`는 이 필드에서 계산한다. 코드가 다시 특정 해시 문자열을 기본 PIN 판정의 정본으로 사용하지 않는다.

## 6. PIN 저장과 전환

새 PIN은 표준 라이브러리의 `PBKDF2-HMAC-SHA256`으로 저장한다. 저장 문자열은 버전, 반복 횟수, salt, digest를 포함하는 버전형 포맷으로 고정한다.

```text
pbkdf2_sha256$<iterations>$<salt_base64>$<digest_base64>
```

- salt: CSPRNG 16바이트 이상
- digest: 32바이트
- 비교: constant-time 비교
- 반복 횟수: `600,000`; hash 문자열에 함께 저장해 이후 상향 가능하게 함

기존 64자리 SHA-256 해시는 로그인 전환 기간에만 읽는다. 비기본 기존 PIN의 검증이 성공하면 같은 DB transaction 안에서 새 포맷으로 업그레이드하고 세션을 만든다. 역방향 변환이나 평문 PIN 저장은 하지 않는다.

4자리 PIN은 가능한 조합이 적으므로 강한 비밀번호와 동등하지 않다. `(employee_id + client IP)` 기준 현재 5분/10회 실패 제한을 유지하고, 로그인·최초 변경·일반 PIN 변경에 같은 제한 계약을 적용한다. 제한 상태가 프로세스 재시작으로 사라지는 현재 in-memory 구현은 후속 보안 강화 후보로 기록하되 이번 카드에서 분산 rate-limit 저장소까지 도입하지 않는다.

## 7. API 계약

### 작업자 세션

#### `POST /api/operator-session`

입력:

```json
{
  "employee_id": "uuid",
  "pin": "1234"
}
```

성공 시 활성 직원의 프로필과 세션 메타데이터를 반환하고 `dexcowin_operator_session` 쿠키를 설정한다. legacy hash 업그레이드와 세션 INSERT를 한 transaction으로 commit한 뒤에만 쿠키를 쓴다.

기본 PIN 또는 `pin_requires_change=true`이면 작업 세션을 발급하지 않는다. 대신 `409 PIN_CHANGE_REQUIRED`와 10분 절대 만료의 1회성 `pin_change_challenge` HttpOnly 쿠키를 발급한다. DB에는 `purpose=pin_change` 세션 행을 만들며, 이 challenge는 해당 직원의 새 PIN 설정 한 번에만 사용할 수 있고 mutation actor가 될 수 없다.

#### `GET /api/operator-session`

현재 쿠키를 검증해 서버가 복원한 작업자 프로필, 세션 만료 시각, `boot_id`를 반환한다. 프런트엔드의 로그인 여부와 actor 정보의 유일한 정본이다.

#### `DELETE /api/operator-session`

현재 세션을 DB에서 폐기하고 쿠키를 삭제한다. 이미 만료·폐기된 세션이어도 쿠키를 지우며 idempotent하게 성공한다.

### 최초 PIN 설정과 일반 변경

#### `POST /api/operator-session/complete-pin-change`

`pin_change_challenge`와 `new_pin`을 검증한다. challenge 행을 잠그고 `consumed_at IS NULL`, 만료·boot identity·직원 상태를 확인한다. challenge 직원의 PIN을 새 포맷으로 저장하고 `pin_requires_change=false`로 바꾸며, challenge 소비·해당 직원의 기존 세션 폐기·감사 기록을 한 transaction으로 처리한다. 이 요청 자체는 작업 세션을 발급하지 않는다. 성공 후 프런트엔드는 새 PIN으로 `POST /api/operator-session`을 다시 호출한다.

기본 PIN `0000`은 공개된 초기값이므로 최초 변경 challenge만으로 실제 사람의 신원을 강하게 증명하지는 못한다. 신규·초기화 직원은 관리자와 대면 상태에서 즉시 새 PIN을 설정한다는 운영 절차를 적용한다. challenge 단계의 감사 행은 `verified_actor`로 기록하지 않고 `bootstrap_employee_id`와 request ID를 별도 필드로 남긴다. HTTPS 전에는 challenge 탈취 위험도 남는다.

기존 `POST /api/employees/{employee_id}/change-pin`은 로그인된 본인의 일반 PIN 변경 endpoint로 전환한다. 세션 actor와 path 직원이 같아야 하고 현재 PIN을 다시 요구한다. PIN 변경, 전 세션 폐기, 감사 기록은 한 transaction이다.

관리자 초기화는 기존 step-up을 유지하되 대상 직원의 `pin_requires_change=true` 설정과 전 세션 폐기를 같은 transaction에 포함한다.

### 호환 경로

`POST /api/employees/{employee_id}/verify-pin`은 한 release 동안 canonical session service를 호출하는 호환 alias로 둔다. 성공 시 같은 DB 세션·쿠키를 발급하며 별도의 감사용 서명 쿠키를 만들지 않는다. 프런트엔드와 E2E가 새 API로 전환되고 consumer가 0임을 확인한 다음 제거 카드를 별도로 실행한다.

### 오류 코드

| HTTP | code | 의미 |
|---|---|---|
| 401 | `AUTH_REQUIRED` | 세션 쿠키 없음 또는 해석 불가 |
| 401 | `SESSION_EXPIRED` | 만료·폐기·다른 boot 세션 |
| 403 | `ACTOR_MISMATCH` | 요청이 다른 직원을 행위자로 주장 |
| 403 | `EMPLOYEE_INACTIVE` | 직원 비활성·삭제 |
| 409 | `PIN_CHANGE_REQUIRED` | 새 PIN 설정 전 작업 세션 발급 금지 |
| 429 | `TOO_MANY_REQUESTS` | PIN 실패 제한 초과 |

오류 응답은 기존 공통 error envelope를 사용한다. 로그인 실패는 직원 존재 여부를 과도하게 노출하지 않도록 잘못된 직원·PIN 응답 문구를 통일하되, 비활성 직원은 선택 목록과 운영 진단을 위해 별도 code를 유지한다.

## 8. 쿠키와 만료

- 이름: `dexcowin_operator_session`
- 속성: `HttpOnly`, `SameSite=Lax`, `Path=/`
- 만료: 발급 후 12시간 절대 만료, sliding refresh 없음
- `Secure`: HTTPS가 적용된 환경에서만 true
- 토큰 원문: 브라우저 쿠키에만 존재, 응답 body·로그·DB에 노출하지 않음

현재 HTTP LAN에서는 `Secure` 쿠키를 사용할 수 없으므로 전송 구간 탈취 위험이 남는다. 이 제약은 UI 문구·운영 문서·보안 후속 카드에 명시한다. HTTPS 전환 뒤에는 운영 환경에서 `Secure=true`를 fail-closed로 강제한다.

## 9. 서버 구성요소

### `runtime_identity`

현재 `main.py`에 있는 `boot_id` 생성을 작은 공용 module로 옮긴다. app-session 응답과 session service가 같은 값을 사용하며 순환 import를 만들지 않는다. 서버가 재시작되면 새 `boot_id`가 생성되어 이전 세션은 즉시 무효가 된다.

### `operator_session` service

토큰 발급·digest, 세션 생성·조회·폐기, 직원별 일괄 폐기를 담당한다. PIN 검증이나 HTTP cookie 쓰기는 직접 소유하지 않는다.

### `pin_auth` service

새 PBKDF2 포맷 생성·검증, legacy SHA-256 검증과 업그레이드 필요 여부를 순수 함수로 반환한다. DB commit이나 HTTP 예외를 소유하지 않는다.

### `VerifiedActor` dependency

요청 cookie를 읽고 다음을 순서대로 검증한다.

1. 토큰 digest와 일치하는 `purpose=operator` 세션 존재
2. `revoked_at IS NULL`, `consumed_at IS NULL`
3. 현재 시각이 `expires_at`보다 이전
4. 세션 `boot_id`와 현재 boot identity 일치
5. 연결 직원 존재·활성
6. `pin_requires_change=false`

성공하면 `Employee`를 반환하고 `request.state.verified_actor`에 직원 코드를 설정한다. 이 이후의 access log, audit, transaction log, notification, event는 동일 값을 사용한다.

## 10. mutation 적용 범위

구현은 등록된 FastAPI route에서 `POST`, `PUT`, `PATCH`, `DELETE` 전체 manifest를 생성하고 각 route를 다음 중 하나로 분류한다.

1. `VerifiedActor` 필수
2. 인증 bootstrap: 작업자 세션 생성, 최초 PIN 설정
3. 비업무 시스템 endpoint: health, client telemetry 등 명시적 예외

최소 필수 업무 표면은 다음과 같다.

- IO V2와 StockRequest 제출·승인·반려·취소
- 입고, 창고↔부서, 부서↔부서, AS·연구 사용
- 생산, BOM backflush, 부서조정, 재작업, 불량
- 출하 요청·구성변경·준비·픽업·각 취소
- 거래 정정·일반 취소
- 인수인계 수령
- 창고 지도 이동·박스·특수구역 mutation
- 직원·설정·관리자 재고 복구 mutation

manifest와 실제 route 집합의 양방향 차집합을 테스트해 새 mutation이 분류 없이 추가되면 gate를 실패시킨다. 서비스 직접 호출은 actor를 명시적 인자로 받고, router가 body/header actor를 그대로 전달하지 않는다.

## 11. 프런트엔드 흐름

1. 앱 시작·새로고침 때 `GET /api/operator-session`을 호출한다.
2. 성공하면 서버 응답 프로필로 화면 상태를 구성한다.
3. `401`이면 로그인 카드로 돌아가고 기존 작업자 cache를 지운다.
4. 로그인에서 `PIN_CHANGE_REQUIRED`가 오면 새 PIN·확인 입력 화면으로 전환한다.
5. 최초 PIN 설정 성공 후 새 PIN으로 로그인 API를 다시 호출한다.
6. 로그아웃은 서버 `DELETE` 성공 여부와 관계없이 로컬 표시 cache를 지운다.

`sessionStorage`에는 테마·사이드바 같은 화면 편의를 위한 복사본만 둘 수 있다. 직원 ID·역할·권한은 API mutation 결정에 사용하지 않는다. API client는 cookie를 자동 전송하며 `X-MES-Employee-Code`를 authorization 용도로 만들지 않는다.

세션이 만료되거나 다른 탭에서 로그아웃된 경우 다음 mutation의 `401`에서 안전하게 로그인 화면으로 이동한다. 작성 중 form은 기존 dirty guard 정책에 따라 로컬 화면에 남길 수 있지만 자동 재전송하지 않는다.

## 12. transaction과 폐기 정책

- 로그인: legacy hash 업그레이드 + session INSERT를 한 commit으로 처리하고 commit 성공 후 cookie 설정
- 최초 PIN 설정: PIN 변경 + `pin_requires_change=false` + 기존 session revoke + audit를 한 commit
- 일반 PIN 변경·관리자 초기화: PIN 변경 + 모든 session revoke + audit를 한 commit
- 직원 비활성화·삭제: 직원 상태 변경 + 모든 session revoke + audit를 한 commit
- 로그아웃: 현재 session revoke 한 commit, cookie 삭제는 DB 결과와 무관하게 실행

audit insert나 flush, 최종 commit이 실패하면 PIN·직원 상태·session 폐기가 함께 rollback되어야 한다. 실패한 transaction 뒤 cookie를 새로 발급하지 않는다.

만료 세션 행은 인증 시 삭제하지 않는다. 운영 cleanup이 정해진 보존 기간 뒤 배치 삭제하며, cleanup 실패가 로그인·mutation transaction을 막지 않는다.

## 13. migration과 호환

additive Alembic migration으로 `operator_sessions`와 `employees.pin_requires_change`를 추가하고 기존 직원을 backfill한다. 실제 직원 DB에는 접근하지 않고 격리 SQLite와 선택적 ephemeral PostgreSQL에서 검증한다.

upgrade 검증:

- legacy null/default/custom PIN 세 종류의 flag가 정확함
- 기존 직원·부서·재고 행과 hash가 보존됨
- session 인덱스와 FK가 SQLite/PostgreSQL에서 생성됨

rollback은 애플리케이션 버전을 되돌리되 additive table·column은 보존하는 forward-compatible 방식으로 한다. 새 PBKDF2 hash를 legacy SHA-256으로 되돌릴 수 없으므로 데이터 downgrade는 하지 않는다. 이전 애플리케이션이 새 hash를 읽지 못하는 상태에서는 해당 사용자의 PIN을 관리자 절차로 다시 설정해야 하므로, 배포 전 forward restore rehearsal과 애플리케이션 rollback 호환 테스트를 필수로 한다.

## 14. 테스트 전략

### 순수 단위 테스트

- 새 hash round-trip, salt uniqueness, constant-time compare 경로
- legacy SHA 성공·실패와 업그레이드 판정
- default/null/custom backfill 판정
- 토큰 digest와 12시간 절대 만료

### service·router 테스트

- 정상 로그인, 잘못된 PIN, rate limit, 비활성 직원
- 기본 PIN 로그인은 challenge만 발급하고 session 0
- challenge 만료·재사용·다른 직원 사용 거부와 동시 소비 성공자 1명
- PIN 설정 뒤 새 PIN 로그인 성공, 기존 기본 PIN 실패
- 로그아웃·PIN 변경·초기화·직원 비활성화·삭제 시 session 폐기
- 서버 boot identity 변경 뒤 기존 session 거부
- audit/flush/commit 실패 시 원자 rollback과 cookie 미발급
- body/header 직원 spoof 시 재고·로그·event 변화 0
- 관리자 mutation은 직원 session과 admin PIN 둘 다 필요

### mutation manifest 테스트

- 등록된 모든 mutation route가 필수·bootstrap·예외 중 정확히 하나에 속함
- IO, 출하, 생산, 불량, 정정·취소, 인수인계, 창고 지도, 설정 복구의 실제 HTTP 경로가 server actor를 사용함
- 서비스 직접 호출도 actor 누락을 fail-closed

### 프런트엔드·E2E

- 로그인, 기본 PIN 변경, 새로고침 복원, 로그아웃
- `sessionStorage` 직원 변조 뒤 mutation 거부
- `X-MES-Employee-Code` 변조 뒤 mutation actor 불변
- 세션 만료·서버 restart에서 로그인 화면 복귀
- 데스크톱·모바일 동일 actor 표시
- 실제 입출고·출하·불량 작업의 UI actor, API actor, raw SQL audit actor 일치

### DB engine

- SQLite focused suite
- Alembic head의 ephemeral PostgreSQL에서 독립 connection 검증
- 세션 폐기와 동시에 들어오는 mutation은 정확히 하나의 결과만 허용하고, 폐기 이후 새 mutation 성공 0

## 15. 관측과 운영

로그에는 session UUID 전체나 token을 남기지 않는다. 필요한 경우 session UUID의 짧은 비밀 아닌 correlation 값, verified employee code, request ID, 결과 code만 기록한다.

운영 점검은 다음을 제공한다.

- 만료됐지만 미정리된 session 수
- 활성 직원별 활성 session 수
- 다른 boot identity의 활성 표시 session 수는 항상 0
- 기본 PIN 변경 필요 활성 직원 수
- 인증 실패·rate-limit 발생 수

이 지표는 운영 판단용이며 인증 성공 여부의 정본은 매 요청의 DB 검증이다.

## 16. 배포 순서

1. additive migration과 PIN/hash/session service 배포
2. 로그인·최초 PIN 변경 API와 호환 alias 배포
3. 프런트엔드를 server session 정본으로 전환
4. mutation manifest와 `VerifiedActor`를 전 경로에 한 번에 적용
5. spoof·expiry·revoke·restart·실제 재고 E2E 통과
6. 호환 `verify-pin` consumer 0 확인 후 제거를 후속 change로 분리

3단계와 4단계 사이의 버전은 짧은 배포 window로만 허용한다. `VerifiedActor`가 일부 mutation에만 적용된 혼합 상태를 운영 완료 상태로 취급하지 않는다.

## 17. 비범위와 후속 보안 작업

이번 카드에 포함하지 않는다.

- HTTPS/TLS 인증서와 reverse proxy 구성
- 4자리 PIN을 긴 비밀번호·MFA로 교체
- 관리자 PIN 체계 전체 재설계
- 승인 역할·self-approval 정책 재설계
- 외부 IdP, SSO, JWT
- 로그인 화면의 시각적 재설계

후속 `SEC-01`은 HTTPS 적용, 운영 환경 `Secure` cookie fail-closed, HTTP→HTTPS redirect, 인증서 갱신·복구 runbook, LAN packet-sniff 위협 검증을 다룬다. 이 작업이 끝나기 전에는 “신뢰할 수 없는 네트워크에서도 안전” 또는 “인터넷 공개 가능”이라고 판정하지 않는다.

## 18. 합격 조건

1. 기본 PIN·미설정 PIN 직원의 mutation 성공 0
2. 유효 session 없는 mutation 성공 0
3. body/header/sessionStorage spoof에 의한 actor 변경 0
4. 모든 mutation route의 분류 누락 0
5. transaction log, audit, event의 actor가 `VerifiedActor`와 정확히 일치
6. 로그아웃·PIN 변경·초기화·비활성화·삭제·서버 restart 후 기존 session 성공 0
7. 12시간 이후 session 성공 0, sliding 연장 0
8. PIN/session/audit transaction 실패 뒤 부분 변경 0
9. SQLite와 필수 PostgreSQL 세션·폐기 경합 gate 통과
10. OpenAPI, backend, frontend type, focused E2E, 전체 통합 gate 통과
11. 제품 DB·직원 환경 접근 0
12. HTTPS 미적용 위험과 후속 작업이 운영 문서에 명시됨
