# _evt.py

## 이 파일은 뭐예요?
도메인 이벤트를 구조화 로그 1줄로 남기는 표준 emit 헬퍼입니다. `rid`·`emp`를 request에서 자동 추출하고, PII/인증정보 키(pin, password, token, secret 등)가 섞이면 즉시 RuntimeError를 던집니다.

## 언제 보나요?
- 출고·입고·결재 등 도메인 이벤트 로그(`evt=io_submit`, `evt=neg_block` 등)를 추가할 때
- 로그에서 특정 `evt=` 값으로 검색해 흐름을 추적할 때
- 민감 키가 실수로 emit에 넘어가 RuntimeError가 발생했을 때

## 중요한 내용
- `emit(action, request=None, level="info", **kv)` — 유일한 public 함수
- `_DENY_SUBSTR = ("pin", "password", "token", "secret", "hash")` — 이 단어가 키에 포함되면 RuntimeError
- `_fmt_value(v)` — None → `"-"`, 공백/탭/등호/따옴표가 있으면 쌍따옴표로 래핑
- commit 직후에만 호출해야 함 (rollback 이후 호출 시 거짓 로그 발생)
- 출력 형식: `evt=<action> rid=<rid> emp=<emp> key=val ...`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/_actor.py]] — `get_actor_emp` 제공
- [[ERP/backend/app/_logging.py]] — `get_logger` 제공
