# _slow_query.py

## 이 파일은 뭐예요?
SQLAlchemy 엔진에 before/after cursor 훅을 설치해 슬로우 쿼리를 감지하는 모듈입니다. `SLOW_QUERY_MS`(기본 500ms)를 초과하면 `evt=slow_query` WARN 로그를 1줄 남깁니다.

## 언제 보나요?
- DB 쿼리가 느리다는 운영 로그(`evt=slow_query`)가 보여서 원인을 찾을 때
- 슬로우 쿼리 임계값(`SLOW_QUERY_MS`)을 바꾸거나 훅 동작을 수정할 때

## 중요한 내용
- `install_slow_query_hook(engine)` — 엔진에 훅 1회 설치(멱등, 중복 설치 안전)
- `SLOW_QUERY_MS` — 환경변수 `SLOW_QUERY_MS`(기본 500ms)
- SQL 본문은 80자 truncate(`_SQL_MAX = 80`)해서 로그 노이즈 방지
- `engine._mes_slow_query_hooked` 플래그로 중복 설치 방지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/database.py]] — 엔진 생성 후 `install_slow_query_hook` 호출 위치
- [[ERP/backend/app/_logging.py]] — `get_logger` 제공
