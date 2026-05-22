---
type: folder-note
source_path: "backend/tests/routers"
importance: normal
layer: backend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 routers

## 이 폴더는 무엇을 위한 곳인가

`backend/tests/routers`는 백엔드 안의 세부 폴더입니다.

## 현장 업무와의 관계

API, DB, 서비스 규칙 중 한 영역과 연결됩니다.

## 언제 보면 좋나

- 이 폴더 안의 파일이 어떤 역할인지 빠르게 파악할 때
- 수정 전에 먼저 읽을 파일을 고를 때

## 먼저 볼 파일 5개

- [[ERP/backend/tests/routers/__init__.py]] — `__init__.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/routers/test_admin_audit.py]] — `test_admin_audit.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/routers/test_admin_audit_csv.py]] — `test_admin_audit_csv.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/routers/test_bom_smoke.py]] — `test_bom_smoke.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.
- [[ERP/backend/tests/routers/test_capacity.py]] — `test_capacity.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

> [!info]- 추가 파일
> - [[ERP/backend/tests/routers/test_dept_adjustment.py]] — test_dept_adjustment.py
> - [[ERP/backend/tests/routers/test_employee_pin.py]] — test_employee_pin.py
> - [[ERP/backend/tests/routers/test_health_smoke.py]] — test_health_smoke.py
> - [[ERP/backend/tests/routers/test_inventory_smoke.py]] — test_inventory_smoke.py
> - [[ERP/backend/tests/routers/test_items_update.py]] — test_items_update.py
> - [[ERP/backend/tests/routers/test_pin_hardening.py]] — test_pin_hardening.py
> - [[ERP/backend/tests/routers/test_settings_integrity.py]] — test_settings_integrity.py
> - [[ERP/backend/tests/routers/test_transaction_edit.py]] — test_transaction_edit.py
> - [[ERP/backend/tests/routers/test_transactions_summary.py]] — test_transactions_summary.py
> - [[ERP/backend/tests/routers/test_weekly_report.py]] — test_weekly_report.py

## 조심할 점

폴더 성격을 먼저 확인하고 현재 운영 코드인지, 보관 자료인지, 자동 생성물인지 구분해야 합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/tests/📁_tests]]
