---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/services/test_dept_adjustment.py
tags: [vault, code-note, b-tier]
---

# test_dept_adjustment.py — services/dept_adjustment.py 부서별 조정 테스트

> [!summary] 역할
> 부서 간 부품 이동, 불량 격리, 수량 조정 로직 검증. TransactionLog 기록 및 InventoryLocation 상태 변화 테스트.

## 1. 이 파일의 역할
- _prod_qty(), _defective_qty() — 부서별 PRODUCTION/DEFECTIVE 위치 수량 조회 헬퍼
- _tx_types() — 생성된 거래 타입 목록 반환
- 부서 조정 서비스의 핵심 시나리오 (생산 → 불량 격리, 부서 간 이동 등) 테스트
- DepartmentEnum.ASSEMBLY 기본값으로 사용

## 2. 실제 원본 위치
`backend/tests/services/test_dept_adjustment.py` — 약 150줄

## 3. 주요 import
```python
from decimal import Decimal
import pytest
from app.models import DepartmentEnum, DeptAdjSubTypeEnum, LocationStatusEnum, TransactionTypeEnum
from app.services import dept_adjustment as svc, inventory as inv_svc
```

## 4. 어디서 쓰이는지
- pytest 단위 테스트
- 불량 처리 흐름 변경 시 회귀 테스트
- 부서별 재고 출입 로직 검증

## 5. ⚠️ 위험 포인트
- **InventoryLocation 생성은 자동 vs 수동** — 테스트에서 생성할 때 정확한 department/status 설정 필수
- DeptAdjSubTypeEnum (production/discard/rework 등) 매핑 정확성 확인
- TransactionLog 기록 시 quantity_before/after 일치 검증 (단계별 누적 잘못될 가능성)
- ASSEMBLY 부서만 테스트 — 다른 부서(VACUUM/HIGH_VOLTAGE 등) 케이스 추가 필요할 수 있음

## 6. 수정 전 체크
- _prod_qty(item_id, ASSEMBLY) 호출 후 InventoryLocation의 quantity 값 일치
- 불량 격리 거래 후 TransactionTypeEnum.MOVE_TO_DEFECTIVE 기록 확인
- 여러 거래 후 quantity_before/after 체인 연결 확인
