---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/randomize_inventory.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# randomize_inventory.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/randomize_inventory.py]]

## 원본 첫 줄 (또는 메타)

```
"""
창고/부서 랜덤 재고 분배 + 안전재고 설정 스크립트.

Usage:
    python scripts/dev/randomize_inventory.py           # dry-run (미리보기만)
    python scripts/dev/randomize_inventory.py --apply   # 실제 DB 반영

규칙:
- 각 품목의 현재 총 수량을 창고 + 1~3개 부서로 랜덤 분배
- process_type_code 별 주요 부서 가중치 반영 (TR/TA/TF→튜브, AA/AF→조립, PA/PF→출하, ...)
- 10% 확률로 불량 재고 추가 (총량의 2-8%)
- 안전재고: 70% 품목에 설정, 그 중 30%는 현재 재고 이하로 설정해 경보 테스트
"""
from __future__ import annotations

import os
import random
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{(BACKEND_DIR / 'erp.db').as_posix()}"

```
