---
type: file-explanation
source_path: "_attic/scripts/dev/import_real_inventory.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# import_real_inventory.py — import_real_inventory.py 설명

## 이 파일은 무엇을 책임지나

`import_real_inventory.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `parse_decimal`
- `read_rows`
- `assign_item_codes`
- `apply_rows`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
data/재고_입력_양식.xlsx 를 읽어서 items / inventory 테이블에 반영.

기본 동작:
    py scripts/dev/import_real_inventory.py
        → dry-run. 몇 건 추가/업데이트/스킵될지 리포트만 출력.

실제 반영:
    py scripts/dev/import_real_inventory.py --apply
        → 기존 품목은 품번(item_code) 기준 upsert, 없으면 새 품목 등록.

기존 971개 테스트 데이터 삭제 후 완전 교체:
    py scripts/dev/import_real_inventory.py --apply --wipe-existing
        (주의: 되돌릴 수 없음. 사용자 확인 필수)
"""

from __future__ import annotations

import os
import sys
from argparse import ArgumentParser
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_XLSX = ROOT / "data" / "재고_입력_양식.xlsx"
BACKEND_DIR = ROOT / "backend"
SQLITE_PATH = BACKEND_DIR / "erp.db"

sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{SQLITE_PATH.as_posix()}")

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Inventory, InventoryLocation, Item, LocationStatusEnum  # noqa: E402
from app.services.inventory import PROCESS_TYPE_TO_DEPT  # noqa: E402

_R_SERIES = {"TR", "HR", "VR", "NR", "AR", "PR"}


# 양식과 1:1 매칭되는 헤더 (순서 무관, 헤더명으로 찾음)
REQUIRED_HEADERS = ["품목명", "공정코드", "현재수량"]
OPTIONAL_HEADERS = ["규격", "단위", "부서", "모델", "품번", "자재분류", "공급사", "안전재고", "바코드"]
ALL_HEADERS = REQUIRED_HEADERS + OPTIONAL_HEADERS

DATA_START_ROW = 6  # 1=헤더, 2~4=예시, 5=힌트, 6~=실입력

VALID_PROCESS_TYPE_CODES = {
    "TR", "HR", "VR", "NR", "AR", "PR",
    "TA", "HA", "VA", "NA", "AA", "PA",
    "TF", "HF", "VF", "NF", "AF", "PF",
```
