---
type: index
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/services/
tags: [vault, index, folder-marker]
aliases:
  - "services"
  - "services.md"
---

# 📁 services

> [!summary] 역할
> 라우터가 위임하는 비즈니스 로직과 트랜잭션 경계 모음. DB 상태 변이는 원칙적으로 이 계층에서만 일어난다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/backend/app/services/` 의 vault 미러. 자식 파일들의 분석 노트가 모여 있다.

## 어떤 파일들이 있나

재고·수량 핵심:
- `[[erp/backend/app/services/inventory.py|inventory.py]]` — 3-버킷 재고 모델 구현. 입고·이동·불량·반품 실행 함수. `warehouse_qty` ↔ `InventoryLocation` 불변식 유지.
- `[[erp/backend/app/services/stock_math.py|stock_math.py]]` — 재고 수량 계산 유틸. 가용 재고(`available`), pending 차감 등 순수 연산.
- `[[erp/backend/app/services/stock_requests.py|stock_requests.py]]` — 불출 요청 상태 전이 (PENDING → APPROVED / REJECTED / CANCELLED). 낙관적 락 포함.
- `[[erp/backend/app/services/dept_adjustment.py|dept_adjustment.py]]` — 부서 재고 수동 조정. 조정 이력 기록.
- `[[erp/backend/app/services/io.py|io.py]]` — 입출고 v2 고수준 로직.

감사·코드·관리:
- `[[erp/backend/app/services/audit.py|audit.py]]` — 감사 로그 쓰기·조회.
- `[[erp/backend/app/services/audit_csv.py|audit_csv.py]]` — SQLAlchemy 세션 이벤트 리스너 기반 자동 감사 CSV 기록. `register_session_listeners()` 로 앱 시작 시 등록.
- `[[erp/backend/app/services/integrity.py|integrity.py]]` — 재고 불변식 검증 (`check_inventory_integrity()`). 진단 및 자가 수복 도구.
- `[[erp/backend/app/services/codes.py|codes.py]]` — 공통 코드 CRUD.
- `[[erp/backend/app/services/bom.py|bom.py]]` — BOM 조회·수정·검증.

인프라·보조:
- `pin_auth.py` — 직원 PIN 인증 로직.
- `rate_limit.py` — 간단한 인메모리 레이트 리밋.
- `export_helpers.py` — xlsx / CSV 생성 공통 함수.
- `seed_cleanup.py` — 테스트/개발용 시드 데이터 정리.
- `_tx.py` — 트랜잭션 컨텍스트 헬퍼 (내부 전용).

## 도메인 컨텍스트

MES 의 실질적인 업무 규칙이 이 폴더에 집중된다. 라우터는 HTTP 파싱만 담당하고, 상태 변이·검증·집계는 서비스로 위임하는 구조다. 동시성 안전성(낙관적 락, FOR UPDATE)도 이 계층에서 처리한다.

## ⚠️ 위험 포인트

- `audit_csv.py` 는 SQLAlchemy 이벤트에 훅이 걸려 있어 서비스 함수 외부에서 직접 세션을 커밋하면 감사 기록이 누락될 수 있음.
- `integrity.py` 의 수복 함수는 재고를 직접 수정함 — 운영 중 실행 전 반드시 영향 범위 확인.
- `stock_requests.py` 상태 전이는 동시성 테스트 커버리지가 있으므로 변경 시 `tests/concurrency/` 통과 필수.

## 관련 가이드

- [[erp/_vault/guides/inventory-3bucket|inventory-3bucket]]
- [[erp/_vault/guides/audit-csv|audit-csv]]
- [[erp/_vault/guides/bootstrap-db|bootstrap-db]]
