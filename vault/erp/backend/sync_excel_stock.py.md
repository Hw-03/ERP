---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/sync_excel_stock.py
tags: [vault, code-note, b-tier]
---

# sync_excel_stock.py — 레거시 메타 + 현재 재고 엑셀 → DB 동기화

> [!summary] 역할
> 외부 Excel 파일(부서별 재고 현황)을 읽어 Inventory/InventoryLocation에 동기화. 원자재(R) vs 조립(A/F) 구분 반영.

## 1. 이 파일의 역할
- PROCESS_TYPE_TO_FILE_TYPE: 공정코드 → Excel 자료 종류 (원자재/조립자재/완제품)
- PROCESS_TYPE_TO_PART: 공정코드 → 파트명 (자재창고/튜브파트/고압파트 등)
- openpyxl 로드 워크북 읽기
- Item 조회 후 warehouse_qty / InventoryLocation 업데이트

## 2. 실제 원본 위치
`backend/sync_excel_stock.py` — 약 200줄

## 3. 주요 import
```python
import csv, re, os
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path
from openpyxl import load_workbook
from app.database import SessionLocal
from app.models import Inventory, Item
```

## 4. 어디서 쓰이는지
- 초기 DB 설정 후 레거시 Excel 데이터 일괄 임포트
- 현재는 분석용으로만 유지 (운영 중 호출 안 함)
- 부서별 재고 현황 엑셀 → DB 싱크

## 5. ⚠️ 위험 포인트
- **Excel 파일 경로 hardcoded** — 실제 경로와 다르면 오류
- PROCESS_TYPE_TO_FILE_TYPE 매핑 누락 시 KeyError
- openpyxl load_workbook 시 수식/차트 처리 안 됨 (값만 읽음)
- Item 코드 파싱이 정확할 것만 가정 (검증 없음)

## 6. 수정 전 체크
- Excel 파일 존재 및 시트명 확인
- PROCESS_TYPE_TO_FILE_TYPE 모든 공정코드 커버하는지 확인
- openpyxl로 읽은 cell 값 타입 확인 (문자/숫자 혼재 가능)
