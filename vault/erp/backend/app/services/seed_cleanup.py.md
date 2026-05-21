---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/services/seed_cleanup.py
tags: [vault, code-note, b-tier]
---

# seed_cleanup.py — 722 정리본 엑셀 재고 적재 서비스

> [!summary] 역할
> 운영 초기화 시 "생산부_재고_매칭작업_정리본.xlsx" (722개 품목) 를 DB에 적재. settings./reset 엔드포인트 호출 대상.

## 1. 이 파일의 역할
- DEFAULT_EXCEL_PATH 기본 경로 설정 (outputs/inventory_cleanup/)
- EXPECTED_ROWS=722, EXPECTED_TOTAL_QTY 검증 상수
- DEPT_MAP: 부서 코드(T/H/V/N/A/P) → 부서명 매핑
- _parse_erp_code() 호출로 품목코드 분해 (모델/공정/시리얼/옵션)
- [레거시 부트스트랩] seed.py와 달리 settings./reset 엔드포인트에서만 사용

## 2. 실제 원본 위치
`backend/app/services/seed_cleanup.py` — 약 150줄

## 3. 주요 import
```python
from decimal import Decimal
from pathlib import Path
from sqlalchemy.orm import Session
from app.models import Inventory, InventoryLocation, Item, LocationStatusEnum
try:
    import openpyxl
except ImportError:
    openpyxl = None  # 선택적 의존
```

## 4. 어디서 쓰이는지
- `backend/app/routers/settings.py` — POST /settings/reset 엔드포인트에서 호출
- 운영 초기화 시나리오: 레거시 데이터 일괄 정리 후 722개 신규 품목 적재

## 5. ⚠️ 위험 포인트
- **엑셀 파일 경로 hardcoded** — 실제 경로와 다르면 silent fail (openpyxl=None 폴백)
- EXPECTED_ROWS 검증만 하고, 수량 불일치 시 예외 처리 없음
- _parse_erp_code는 품목코드 형식이 정확할 것만 가정 (validation 없음)
- Inventory/InventoryLocation 자동 생성 로직이 존재할 때만 동작

## 6. 수정 전 체크
- 엑셀 파일 존재 여부 및 행 개수 확인
- DEPT_MAP의 모든 부서 코드가 DepartmentEnum과 매핑되는지 확인
- seed_cleanup() 호출 전후 inventory 데이터 상태 비교
