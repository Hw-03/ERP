# init.py

## 이 파일은 뭐예요?
SQLAlchemy `Base.metadata.create_all`을 호출해 DB 테이블을 생성한다. 이미 존재하는 테이블은 무시하므로 재실행해도 안전(no-op).

## 언제 보나요?
- 부트스트랩 1단계(스키마 생성)가 어떻게 동작하는지 확인할 때
- `bootstrap_all()` 흐름의 첫 단계를 추적할 때
- fresh DB를 처음 초기화할 때 어떤 테이블이 만들어지는지 확인하려 할 때

## 중요한 내용
- `run_schema_create_all() -> None` — `Base.metadata.create_all(bind=engine)` 한 줄이 전부. 테이블 이미 존재하면 건드리지 않는다.
- ORM 모델 정의는 `app/database.py`의 `Base`와 각 모델 파일이 결정하므로, 실제 테이블 구조를 보려면 모델 파일을 확인해야 한다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/database.py]] — `Base`, `engine` 정의
- [[ERP/backend/bootstrap/__init__.py]] — 이 함수를 re-export하고 호출 순서를 결정하는 패키지 진입점
