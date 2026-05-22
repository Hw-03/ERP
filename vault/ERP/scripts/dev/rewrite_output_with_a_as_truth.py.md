---
type: file-explanation
source_path: "scripts/dev/rewrite_output_with_a_as_truth.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# rewrite_output_with_a_as_truth.py — rewrite_output_with_a_as_truth.py 설명

## 이 파일은 무엇을 책임지나

`rewrite_output_with_a_as_truth.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `is_meta`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""산출물 26.05월_수정본 시트의 E(MES 품명)/F(MES 코드)를 A 정본 기준으로 갈아끼움.

A의 매칭 확정 품명을 정본으로 보고, 5월 행에 (품명, 규격) 키로 매핑해서 입력.
- A에 매칭값이 있고 정상 품명(메타 표기 아님)이면 → E·F에 입력 (음영 없음)
- A에 메타 표기 (`(매칭작업에서 삭제됨)` 등) 인 경우 → 회색 음영, E·F 비움
- A에 키 자체가 없는 경우 (5월 신규 자재) → 회색 음영, E·F 비움
"""
import shutil
from pathlib import Path

import openpyxl
from openpyxl.styles import PatternFill

ROOT = Path(__file__).resolve().parents[2]
A_FILE = ROOT / '_attic' / 'data' / '0520 권동환 사원님 재고' / 'F704-03__R00__자재_재고_현황_매칭품명추가.xlsx'
OUT = ROOT / '_attic' / 'data' / '0520 권동환 사원님 재고' / 'F704-03 (R00) 자재 재고 현황_통합_매칭반영_20260520.xlsx'
OUT_BAK = OUT.with_name(OUT.stem + '_자동매칭버전백업_20260520.xlsx')
MATCH = ROOT / '_attic' / 'data' / '생산부_재고_매칭작업_최종.bak_memo13_20260518_101641.xlsx'

FILL_UNMATCH = PatternFill(start_color='D9D9D9', end_color='D9D9D9', fill_type='solid')
FILL_NONE = PatternFill(fill_type=None)


def is_meta(v):
    s = str(v or '').strip()
    return s.startswith('(') and s.endswith(')')


def main():
    # 1) 산출물 백업 (자동매칭 버전 보관)
    if not OUT_BAK.exists():
        shutil.copy(OUT, OUT_BAK)
        print(f'산출물 백업 생성: {OUT_BAK.name}')

    # 2) A → (품명, 규격) → 매칭 확정 품명
    wa = openpyxl.load_workbook(A_FILE, data_only=True)
    a_map = {}  # (품명, 규격) → 매칭 확정 품명 (메타 포함)
    for sheet in ['전체', '26.03월']:
        ws = wa[sheet]
        for r in range(4, ws.max_row + 1):
            prod = ws.cell(row=r, column=4).value
            e = ws.cell(row=r, column=5).value
            spec = ws.cell(row=r, column=7).value  # F열은 MES 코드라 규격은 G(7)
            if not prod:
                continue
            key = (str(prod).strip(), str(spec).strip() if spec else '')
            if key not in a_map and e is not None:
                a_map[key] = str(e).strip()
    print(f'A 매핑: {len(a_map)} 키')

    # 3) 마스터 K → MES 코드
    wm = openpyxl.load_workbook(MATCH, data_only=True)
    ws_m = wm['마스터_품목']
    k_to_mes = {}
    for r in range(2, ws_m.max_row + 1):
```
