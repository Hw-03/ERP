---
type: index
project: ERP
layer: backend
source_path: backend/app/services/
status: active
tags:
  - erp
  - backend
  - service
aliases:
  - 서비스 레이어
---

# backend/app/services

> [!summary] 역할
> 라우터에서 분리한 실제 비즈니스 로직과 계산식을 담는 폴더.
> 이번 브랜치에서는 재고 무결성 점검과 공통 재고 계산식이 별도 서비스로 분리되면서 역할이 더 선명해졌다.

## 하위 문서

- [[backend/app/services/bom.py.md]]
- [[backend/app/services/codes.py.md]]
- [[backend/app/services/inventory.py.md]]
- [[backend/app/services/queue.py.md]]
- [[backend/app/services/integrity.py.md]]
- [[backend/app/services/stock_math.py.md]]

## 이번 브랜치 포인트

- `integrity.py` 는 `inventory.quantity == warehouse + locations` 규칙을 검사/복구한다.
- `stock_math.py` 는 화면과 서비스가 함께 쓰는 재고 수치 계산식을 모아둔다.
- 기존 `inventory.py`, `queue.py` 는 공통 계산을 재사용하는 방향으로 읽어야 이해가 빠르다.

## 읽는 순서

1. [[backend/app/services/stock_math.py.md]]
2. [[backend/app/services/integrity.py.md]]
3. [[backend/app/services/inventory.py.md]]
4. [[backend/app/services/queue.py.md]]

## 관련 문서

- [[backend/app/routers/routers]]
- [[backend/app/models.py.md]]
- [[docs/ITEM_CODE_RULES.md.md]]

Up: [[backend/app/app]]

