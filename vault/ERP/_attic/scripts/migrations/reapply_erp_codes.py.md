---
type: file-explanation
source_path: "_attic/scripts/migrations/reapply_erp_codes.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# reapply_erp_codes.py — reapply_erp_codes.py 설명

## 이 파일은 무엇을 책임지나

`reapply_erp_codes.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `slots_to_symbol`
- `make_erp_code`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/📁_migrations]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""971개 품목의 ERP 코드를 새 체계(다중 모델 기호)로 일괄 재부여.

사용법:
  python scripts/migrations/reapply_erp_codes.py           # dry-run (기본)
  python scripts/migrations/reapply_erp_codes.py --apply   # 실제 DB 반영

규칙:
  - legacy_model 컬럼 기반으로 model_symbol 파생
  - process_type_code 기존 값 + model_symbol 조합으로 시리얼 1부터 재부여
  - "공용"/None legacy_model 품목 → model_symbol="" (NULL), erp_code=NULL 유지
  - item_models 조인 테이블에 (item_id, slot) 삽입
"""

import sys
import sqlite3
import argparse
from pathlib import Path
from collections import defaultdict

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

LEGACY_MODEL_TO_SLOT = {
    "DX3000":    1,
    "COCOON":    2,
    "SOLO":      3,
    "ADX4000W":  4,
    "ADX6000FB": 5,
    "ADX6000":   5,
}

SLOT_TO_SYMBOL = {
    1: "3",
    2: "7",
    3: "8",
    4: "4",
    5: "6",
}


def slots_to_symbol(slots: list[int]) -> str:
    return "".join(sorted(SLOT_TO_SYMBOL[s] for s in slots if s in SLOT_TO_SYMBOL))


def make_erp_code(model_symbol: str, process_type: str, serial_no: int, option_code: str | None = None) -> str:
    base = f"{model_symbol}-{process_type}-{serial_no:04d}"
    return f"{base}-{option_code}" if option_code else base


def main():
    parser = argparse.ArgumentParser(description="ERP 코드 일괄 재부여")
    parser.add_argument("--apply", action="store_true", help="실제 DB 반영 (기본: dry-run)")
    args = parser.parse_args()
    dry_run = not args.apply

    if not DB_PATH.exists():
```
