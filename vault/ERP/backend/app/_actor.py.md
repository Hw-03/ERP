# _actor.py

## 이 파일은 뭐예요?
요청에서 현재 로그인한 직원 사번(actor)을 `request.state`에 붙이고 꺼내는 헬퍼입니다. PIN 검증 성공 직후 `set_actor`를 호출해 사번을 박고, 로그·에러 핸들러에서 `get_actor_emp`로 안전하게 꺼냅니다.

## 언제 보나요?
- 액세스 로그 / 감사(audit) 로그에서 사번이 `-`로 찍혀 추적이 안 될 때
- PIN 검증 코드를 수정하면서 `set_actor` 호출 위치를 확인할 때

## 중요한 내용
- `set_actor(request, employee)` — PIN 검증 성공 직후 호출. `request`가 None이면 no-op
- `get_actor_emp(request)` — 사번 반환, 부착 안 됐으면 `"-"` 반환
- `_UNKNOWN = "-"` — 미인증 요청의 기본값

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/_access_log.py]] — `get_actor_emp` 사용처(액세스 로그)
- [[ERP/backend/app/_evt.py]] — `get_actor_emp` 사용처(도메인 이벤트 로그)
