---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/import_real_inventory.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# import_real_inventory.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/import_real_inventory.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
