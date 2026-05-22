---
type: file-explanation
source_path: "scripts/dev/kwon_match_apply.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# kwon_match_apply.py — kwon_match_apply.py 설명

## 이 파일은 무엇을 책임지나

`kwon_match_apply.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `norm`
- `strip_brackets`
- `norm_loose`
- `get_tokens`
- `build_match_index`
- `gen_variants`
- `models_match`
- `pick_best`
- `match_row`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""권동환 사원님 재고 파일에 MES 품명·MES 코드 칸 끼워넣기.

입력
  - _attic/data/0520 권동환 사원님 재고/F704-03 (R00) 자재 재고 현황_통합.xlsx
  - _attic/data/생산부_재고_매칭작업_최종.bak_memo13_20260518_101641.xlsx

출력
  - _attic/data/0520 권동환 사원님 재고/F704-03 (R00) 자재 재고 현황_통합_매칭반영_20260520.xlsx

대상 시트: 26.05월_수정본 (다른 시트는 손대지 않음)

매칭: L1~L3 자동 채택, L4~L6 추정(노란색 음영), 미매칭(회색 음영).
"""
import re
import shutil
from collections import defaultdict
from pathlib import Path

import openpyxl
from openpyxl.styles import PatternFill

ROOT = Path(__file__).resolve().parents[2]
KWON_SRC = ROOT / '_attic' / 'data' / '0520 권동환 사원님 재고' / 'F704-03 (R00) 자재 재고 현황_통합.xlsx'
MATCH_SRC = ROOT / '_attic' / 'data' / '생산부_재고_매칭작업_최종.bak_memo13_20260518_101641.xlsx'
OUT_PATH = ROOT / '_attic' / 'data' / '0520 권동환 사원님 재고' / 'F704-03 (R00) 자재 재고 현황_통합_매칭반영_20260520.xlsx'

TARGET_SHEET = '26.05월_수정본'

FILL_ESTIMATE = PatternFill(start_color='FFF2CC', end_color='FFF2CC', fill_type='solid')  # 노란색
FILL_UNMATCHED = PatternFill(start_color='D9D9D9', end_color='D9D9D9', fill_type='solid')  # 회색


def norm(s):
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s).strip()).lower()


def strip_brackets(s):
    return re.sub(r'\[...\]', '', str(s)).strip()


def norm_loose(s):
    if s is None:
        return ''
    s = re.sub(r'[_]+', ' ', str(s))
    s = re.sub(r'\s+', ' ', s)
    return s.strip().lower()


def get_tokens(s):
    if s is None:
        return set()
    parts = re.findall(r'[A-Za-z0-9가-힣]{2,}', str(s))
    return set(p.lower() for p in parts)
```
