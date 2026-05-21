---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/routers/test_transaction_edit.py
tags: [vault, code-note, b-tier]
---

# test_transaction_edit.py — 거래 수정 메타/수량 보정 테스트

> [!summary] 역할
> PATCH /api/transactions/{id} 엔드포인트 검증. 거래 메타데이터 + 수량 보정 일괄 처리.

## 1. 이 파일의 역할
- @pytest.fixture editor — 수정 권한 직원 (PIN: 0000)
- @pytest.fixture receive_log — RECEIVE 거래 생성 (quantity_before=0, after=100)
- 거래 메타(reference_no 등) 수정 검증
- 수량 보정 후 quantity_after 자동 계산 (역차감 포함)

## 2. 실제 원본 위치
`backend/tests/routers/test_transaction_edit.py` — 약 150줄

## 3. 주요 import
```python
from decimal import Decimal
import json
import pytest
from app.models import (
    DepartmentEnum, Employee, EmployeeLevelEnum, Inventory, Item,
    TransactionLog, TransactionTypeEnum
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin
```

## 4. 어디서 쓰이는지
- pytest 통합 테스트
- 거래 수정 기능 회귀 테스트 (메타 + 수량)
- 감시인(editor) PIN 검증 시나리오

## 5. ⚠️ 위험 포인트
- **editor 직원이 PIN 0000이면 verify_pin 검증 필수** — DEFAULT_PIN_HASH와 match 확인
- quantity_before/after chain — 이전 거래의 after = 다음 거래의 before 일치 보증
- 권한 체크 미포함 (현재 모든 직원 수정 가능 가정) — RBAC 추가 시 재테스트 필요
- receive_log fixture는 TransactionLog 직접 생성 — 실제 receive 엔드포인트 호출과 다를 수 있음

## 6. 수정 전 체크
- editor의 pin_hash == DEFAULT_PIN_HASH 확인
- PATCH /api/transactions/{id} 응답 200 확인
- quantity_after 수정 후 역차감(inventory 복구) 검증
