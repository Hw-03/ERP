---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/seed.py
tags: [vault, code-note, b-tier]
---

# seed.py — ERP_Master_DB.csv 기반 시드 (레거시 부트스트랩)

> [!summary] 역할
> [레거시] CSV에서 직원/품목/BOM/재고를 일괄 적재. 현재는 settings./reset에서 사용 안 함 (seed_cleanup.py 대체).

## 1. 이 파일의 역할
- CSV_PATH: data/ERP_Master_DB.csv 기본 경로
- LEGACY_HTML_PATH: _legacy_import/inventory_v2.html (HTML 파싱 폴백)
- _R_SERIES: R 시리즈 (TR/HR/VR/NR/AR/PR) 원자재 정의
- R 시리즈 → 창고(warehouse_qty), A/F 시리즈 → 부서(InventoryLocation)로 분류

## 2. 실제 원본 위치
`backend/seed.py` — 약 300줄

## 3. 주요 import
```python
import csv, json, re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from app.models import (
    BOM, DepartmentEnum, Employee, Inventory, Item, TransactionLog
)
```

## 4. 어디서 쓰이는지
- 초기 MES 구축 당시에만 실행
- 현재 운영 초기화는 seed_cleanup.py (722 정리본) 사용
- 데이터 마이그레이션 참고용으로만 남겨둠

## 5. ⚠️ 위험 포인트
- **CSV 형식 강하게 의존** — 헤더/컬럼 순서 변경 시 파싱 실패
- Decimal 파싱 오류 처리 없음 — 수량이 문자열이면 InvalidOperation 발생
- HTML 폴백 (inventory_v2.html) 는 매우 취약 (regex 기반)
- 실행 시간 길어짐 (csv.DictReader 전체 순회 + DB 쓰기)

## 6. 수정 전 체크
- ERP_Master_DB.csv 존재 확인
- CSV 첫 행(헤더) 파싱 확인
- seed 실행 후 Item/Employee/BOM 행 개수 확인
- R/A/F 시리즈 분류 확인
