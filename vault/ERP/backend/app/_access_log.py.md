# _access_log.py

## 이 파일은 뭐예요?
HTTP 요청마다 액세스 로그를 남기는 FastAPI 미들웨어입니다. GET 성공(2xx/3xx)은 침묵하고, 실패(4xx/5xx)·쓰기 성공·슬로우 요청만 선별해서 구조화 로그를 찍습니다.

## 언제 보나요?
- 운영 로그에서 `evt=req_failed` / `evt=slow_req`가 보여서 원인을 추적할 때
- 미들웨어 순서를 바꾸거나 로그 정책(슬로우 임계값 등)을 변경할 때

## 중요한 내용
- `access_log_middleware(request, call_next)` — 유일한 public 함수, `main.py`에서 가장 마지막(outermost)으로 등록해야 함
- `SLOW_REQUEST_MS` — 환경변수 `SLOW_REQUEST_MS`(기본 500ms) 기준, 초과 시 `evt=slow_req` WARN
- 로그 이벤트 종류: `evt=req_failed`(4xx/5xx), `evt=req_ok`(쓰기 성공), `evt=slow_req`(슬로우)
- `request.state.request_id`는 inner 미들웨어가 박은 값을 그대로 사용
- 본문(body)을 절대 읽지 않아 StreamingResponse 안전

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/main.py]] — 미들웨어 등록 순서 확인
- [[ERP/backend/app/_actor.py]] — `get_actor_emp`로 사번 조회
- [[ERP/backend/app/_logging.py]] — `get_logger` 제공
