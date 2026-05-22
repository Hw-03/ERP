---
type: file-explanation
source_path: "_attic/scripts/dev/generate_devlog.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# generate_devlog.py — generate_devlog.py 설명

## 이 파일은 무엇을 책임지나

`generate_devlog.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `classify_work`
- `make_fill`
- `make_border`
- `apply_header`
- `apply_data`
- `auto_col_width`
- `_bar_rich`
- `build_dashboard`
- `build_summary`
- `build_features`
- 그 외 6개 항목

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
개발 현황 엑셀 생성 스크립트
실행: python _attic/scripts/dev/generate_devlog.py
출력: _attic/docs/개발현황.xlsx
"""
import subprocess
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont

OUTPUT_PATH = Path("_attic/docs/개발현황.xlsx")

# ── 색상 상수 ──────────────────────────────────────────────
HEADER_BG   = "1F4E79"
HEADER_FG   = "FFFFFF"
KPI_LABEL_BG = "2E75B6"
KPI_VALUE_BG = "DEEAF1"
DONE_BG     = "E2EFDA"
TODO_BG     = "F2F2F2"
STRIPE_BG   = "EBF3FB"
WHITE_BG    = "FFFFFF"
GOLD_BG     = "FFF2CC"
OFFHOURS_BG = "FCE4D6"   # 커밋 이력 행 — 근무 외 (연주황)
PERSONAL_BG = "EDEDED"   # 커밋 이력 행 — 개인 선행 (연회색)
BAR_WORK    = "000000"   # 막대 ■ — 근무 (검정)
BAR_OFF     = "ED7D31"   # 막대 ■ — 근무 외 (주황)
BAR_PRE     = "9C9C9C"   # 막대 ■ — 개인 선행 (회색)

# ── 근무 구분 판정 ─────────────────────────────────────────
PERSONAL_PRE_END = "2026-04-20"                  # 이 날짜까지는 회사 착수 이전 (개인 선행)
PUBLIC_HOLIDAYS  = {"2026-05-01", "2026-05-05"}  # 노동절·어린이날
FULL_DAY_LEAVE   = {"2026-05-07"}                # 종일 휴가
HALF_DAY_LEAVE   = {"2026-05-19": 12}            # 오후반차 — 해당 시각(시) 이후 근무 외
WORK_START_HOUR  = 8                             # 근무 시작 08:00
WORK_END_HOUR    = 17                            # 근무 종료 17:00

def classify_work(dt):
    """커밋 datetime → '개인 선행' | '근무' | '근무 외'"""
    d = dt.strftime("%Y-%m-%d")
    if d <= PERSONAL_PRE_END:
        return "개인 선행"
    if d in PUBLIC_HOLIDAYS or d in FULL_DAY_LEAVE:
        return "근무 외"
    if dt.weekday() >= 5:                         # 토(5)·일(6)
        return "근무 외"
    if d in HALF_DAY_LEAVE and dt.hour >= HALF_DAY_LEAVE[d]:
        return "근무 외"
    if WORK_START_HOUR <= dt.hour < WORK_END_HOUR:
        return "근무"
```
