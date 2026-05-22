---
type: index
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/inventory/
tags: [vault, index, folder-marker]
aliases:
  - "inventory"
  - "inventory.md"
---

# 📁 inventory

> [!summary] 역할
> 재고 조회·입고·이동·불량·반품·이력 기능을 책임 단위로 분리한 라우터 패키지. Phase 4 에서 단일 파일(807줄)을 이 구조로 분할했다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/backend/app/routers/inventory/` 의 vault 미러. 자식 파일들의 분석 노트가 모여 있다.

## 어떤 파일들이 있나

핵심 서브모듈:
- `[[erp/backend/app/routers/inventory/__init__.py|__init__.py]]` — `router` 조립 파일. 서브 라우터를 `include_router` 순서대로 등록하고, `GET ""` (목록) 엔드포인트를 직접 정의. 정적 경로를 catch-all 보다 먼저 등록하는 순서 규칙이 있음.
- `[[erp/backend/app/routers/inventory/transactions.py|transactions.py]]` — 이력 조회, CSV/xlsx 익스포트, 트랜잭션 수정(PUT)
- `[[erp/backend/app/routers/inventory/query.py|query.py]]` — `/summary`, `/locations/{item_id}` 집계 쿼리
- `[[erp/backend/app/routers/inventory/receive.py|receive.py]]` — `/receive` (입고), `/adjust` (수량 조정)
- `[[erp/backend/app/routers/inventory/transfer.py|transfer.py]]` — `/transfer-to-production`, `/transfer-to-warehouse`, `/transfer-between-depts`

부수 서브모듈:
- `defective.py` — `/mark-defective` 불량 처리
- `supplier.py` — `/return-to-supplier` 공급사 반품
- `weekly_report.py` — 주간 보고 집계 (Phase 4 추가)
- `_shared.py` — `to_response_bulk()` 등 패키지 내 공통 헬퍼

## 도메인 컨텍스트

3-버킷 재고 모델(`warehouse_qty`, `PRODUCTION` 위치, `DEFECTIVE` 위치)을 HTTP 레이어로 노출한다. `Inventory.quantity = warehouse_qty + Σ InventoryLocation.quantity` 불변식이 이 패키지의 모든 쓰기 엔드포인트를 통해 유지된다. 비즈니스 로직은 `services/inventory.py`, `services/stock_math.py` 에 위임.

## ⚠️ 위험 포인트

- `__init__.py` 의 라우터 등록 순서 변경 시 정적 경로가 동적 catch-all에 묻혀 404 또는 잘못된 핸들러 호출 발생 가능.
- `transactions.py` 의 PUT 엔드포인트는 감사 로그에 기록되므로, 수정 범위를 변경할 때 `audit_csv.py` 리스너도 함께 확인.
- 동시성 테스트 (`tests/concurrency/`) 가 이 패키지 엔드포인트를 직접 타격함 — 낙관적 락 코드 변경 시 해당 테스트 먼저 실행.

## 관련 가이드

- [[erp/_vault/guides/inventory-3bucket|inventory-3bucket]]
- [[erp/_vault/guides/router-conventions|router-conventions]]
