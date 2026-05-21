---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/routers/test_dept_adjustment.py
tags: [vault, code-note, b-tier]
---

# test_dept_adjustment.py — 부서 조정 라우터 통합 테스트

> [!summary] 역할
> /api/dept-adjustment/* 엔드포인트 검증. BOM 템플릿, 생산 라인, 조정 기록 API 통합 테스트.

## 1. 이 파일의 역할
- _prod_qty() — ASSEMBLY 부서의 PRODUCTION 위치 수량
- test_get_bom_template_production — GET /bom-template?item_id=... &sub_type=production&quantity=1
- BOM 템플릿 응답: direction(in/out) + lines[] 형태
- 부서별 생산 요구량 계산 (부모 vs 자식 나열)

## 2. 실제 원본 위치
`backend/tests/routers/test_dept_adjustment.py` — 약 120줄

## 3. 주요 import
```python
from decimal import Decimal
from app.models import DepartmentEnum, LocationStatusEnum
```

## 4. 어디서 쓰이는지
- pytest 통합 테스트
- 부서 조정 화면(생산 요구 → BOM 폭발 → 부품 확인) 검증
- API 응답 구조 변경 시 회귀 테스트

## 5. ⚠️ 위험 포인트
- **BOM 템플릿 응답 구조** — direction과 lines 필드가 정확히 named인지 확인 (API 스키마 문서 필수)
- sub_type parameter (production/discard/rework) 값에 따라 응답 달라짐 — 케이스별 테스트 필요
- quantity 파라미터가 D("1")로 들어가는지, 0이나 음수 처리는 어떤지 불명확
- ASSEMBLY 외 다른 부서 조정 로직은 테스트 미포함

## 6. 수정 전 체크
- GET /api/dept-adjustment/bom-template 응답 200 확인
- 응답의 lines[]에 direction="in"과 "out" 모두 있는지 확인
- parent item_id와 child item_id 정확히 일치하는지 확인
