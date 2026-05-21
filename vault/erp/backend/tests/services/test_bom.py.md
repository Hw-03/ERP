---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/services/test_bom.py
tags: [vault, code-note, b-tier]
---

# test_bom.py — services/bom.py BOM 계층 구조 테스트

> [!summary] 역할
> BOM(Bill of Materials) 캐싱, 폭발(explode), 요구사항 합산 로직. MAX_DEPTH 깊이 제한 검증.

## 1. 이 파일의 역할
- build_bom_cache() — Item별 자식 (child_id, quantity) 쌍 캐시
- direct_children() — 1단계 직접 자식 조회
- explode_bom() — 전체 계층 폭발 (모든 후손 재귀)
- merge_requirements() — 같은 자식이 여러 부모에서 필요할 때 수량 합산
- MAX_DEPTH: 순환 참조 방지

## 2. 실제 원본 위치
`backend/tests/services/test_bom.py` — 약 100줄

## 3. 주요 import
```python
from decimal import Decimal
import pytest
from app.services.bom import (
    MAX_DEPTH, build_bom_cache, direct_children, explode_bom, merge_requirements
)
```

## 4. 어디서 쓰이는지
- pytest 단위 테스트
- 부서 조정(생산 요구량 계산)에서 BOM 폭발 사용
- 제품 구성 조회 API

## 5. ⚠️ 위험 포인트
- **explode_bom() 재귀 깊이** — MAX_DEPTH(기본값 10)를 초과하면 예외. 복잡한 계층은 조절 필요
- build_bom_cache 후 DB 상태 변경 시 캐시 미갱신 — 같은 session 내에서만 안전
- merge_requirements() 출력은 (item_id, total_qty) 쌍 리스트 — 정렬 순서 보장 안 함
- Decimal 수량 vs int 시리얼 혼재 가능 (타입 체크 필수)

## 6. 수정 전 체크
- build_bom_cache(empty_session) → {} (빈 DB)
- make_bom(A, B, D("2")) → explode_bom(A, D("5")) → [(B, D("10"))] 확인
- A → B(2) → C(3) 깊이 2 폭발 후 C 수량 = 2*3 = 6 확인
- 순환 참조 방지: MAX_DEPTH 초과 시 예외 발생 확인
