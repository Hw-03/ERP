---
type: folder-note
source_path: "backend/tests"
importance: normal
layer: backend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 tests

## 이 폴더는 무엇을 위한 곳인가

`backend/tests`는 백엔드 안의 세부 폴더입니다.

## 현장 업무와의 관계

API, DB, 서비스 규칙 중 한 영역과 연결됩니다.

## 언제 보면 좋나

- 이 폴더 안의 파일이 어떤 역할인지 빠르게 파악할 때
- 수정 전에 먼저 읽을 파일을 고를 때

## 주요 하위 폴더

- [[ERP/backend/tests/concurrency/📁_concurrency]] — `backend/tests/concurrency`는 백엔드 안의 세부 폴더입니다.
- [[ERP/backend/tests/routers/📁_routers]] — `backend/tests/routers`는 백엔드 안의 세부 폴더입니다.
- [[ERP/backend/tests/services/📁_services]] — `backend/tests/services`는 백엔드 안의 세부 폴더입니다.

## 먼저 볼 파일 5개

- [[ERP/backend/tests/__init__.py]] — `__init__.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/conftest.py]] — `conftest.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/test_defect_flow.py]] — `test_defect_flow.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/test_dept_hierarchy.py]] — `test_dept_hierarchy.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/test_get_db_rollback.py]] — `test_get_db_rollback.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

> [!info]- 추가 파일
> - [[ERP/backend/tests/test_io_v2.py]] — test_io_v2.py
> - [[ERP/backend/tests/test_migration_diagnostics.py]] — test_migration_diagnostics.py
> - [[ERP/backend/tests/test_stock_requests.py]] — test_stock_requests.py

## 조심할 점

폴더 성격을 먼저 확인하고 현재 운영 코드인지, 보관 자료인지, 자동 생성물인지 구분해야 합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/📁_backend]]
