---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/routers/test_inventory_smoke.py
tags: [vault, code-note, b-tier]
---

# test_inventory_smoke.py — 입출고 API 스모크 테스트

> [!summary] 역할
> /api/inventory/* 엔드포인트의 기본 흐름(receive/transfer) 검증. 201/200 응답 + 수량 동기화 확인.

## 1. 이 파일의 역할
- _dec() — Decimal 변환 헬퍼
- _location_qty() — 부서별 PRODUCTION 위치 수량 조회
- test_inventory_receive_transfer_smoke — 입고(receive) + 부서 이동(transfer) 일관성 테스트
- client fixture로 API 호출 (pytest-fastapi)

## 2. 실제 원본 위치
`backend/tests/routers/test_inventory_smoke.py` — 약 100줄

## 3. 주요 import
```python
from decimal import Decimal
from app.models import DepartmentEnum, Inventory, InventoryLocation, LocationStatusEnum, TransactionLog
from app.services import integrity as integrity_svc
```

## 4. 어디서 쓰이는지
- pytest 통합 테스트 (라우터 + DB)
- CI/CD 파이프라인 (API 기본 동작 확인)
- 배포 전 smoke 테스트

## 5. ⚠️ 위험 포인트
- **client.post() 호출 후 db_session 상태** — 라우터가 자동 commit하지 않으면 db_session에서 조회 불가. test fixture 설정 확인 필수
- _dec() string → Decimal 변환 시 부동소수 오차 가능
- warehouse_qty 기본값(0)에서 시작 — 기존 데이터 있으면 테스트 오염

## 6. 수정 전 체크
- POST /api/inventory/receive 응답 코드 201 확인
- 응답 JSON의 warehouse_qty = 요청 quantity 확인
- client.post 후 db_session.query(Inventory) 조회가 업데이트된 값인지 확인
