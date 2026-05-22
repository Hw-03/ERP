---
type: file-explanation
source_path: "scripts/dev/rename_db_dump_sheets.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# rename_db_dump_sheets.py — rename_db_dump_sheets.py 설명

## 이 파일은 무엇을 책임지나

`rename_db_dump_sheets.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""db_dump 파일의 시트명을 한국어로 변경 (DB는 건드리지 않음)"""
from pathlib import Path
import openpyxl
from openpyxl.styles import Font, PatternFill

OUT = Path('_attic/data/db_dump_20260522.xlsx')

RENAME = {
    'admin_audit_logs': '관리자_감사로그',
    'bom': 'BOM_트리',
    'departments': '부서',
    'employee_assigned_models': '사원_담당모델',
    'employees': '사원',
    'inventory': '재고_요약',
    'inventory_locations': '재고_위치별',
    'io_batches': '입출고_배치',
    'io_bundles': '입출고_묶음',
    'io_lines': '입출고_라인',
    'item_models': '품목_모델슬롯',
    'items': '품목',
    'option_codes': '옵션코드',
    'process_flow_rules': '공정흐름_규칙',
    'process_types': '공정유형',
    'product_symbols': '제품기호_슬롯',
    'ship_package_items': '출하패키지_품목(빈)',
    'ship_packages': '출하패키지(빈)',
    'stock_request_lines': '자재요청_라인',
    'stock_requests': '자재요청',
    'system_settings': '시스템설정',
    'transaction_edit_logs': '거래수정_로그',
    'transaction_logs': '거래로그',
    'variance_logs': '재고차이_로그(빈)',
}

HDR_FILL = PatternFill(start_color='305496', end_color='305496', fill_type='solid')
HDR_FONT = Font(color='FFFFFF', bold=True)


def main():
    wb = openpyxl.load_workbook(OUT)

    for old, new in RENAME.items():
        if old in wb.sheetnames:
            ws = wb[old]
            ws.title = new
            print(f'  {old} → {new}')

    if '_index' in wb.sheetnames:
        idx = wb['_index']
        idx.title = '_목차'
        idx.delete_rows(1, idx.max_row)
        idx.append(['한국어 시트명', '원본 테이블명', '행수', '컬럼수', '비고'])
        for c in range(1, 6):
            cell = idx.cell(row=1, column=c)
            cell.fill = HDR_FILL
```
