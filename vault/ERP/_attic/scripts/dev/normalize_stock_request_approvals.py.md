---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/normalize_stock_request_approvals.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# normalize_stock_request_approvals.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/normalize_stock_request_approvals.py]]

## 원본 첫 줄 (또는 메타)

```
"""1회 보정 — '창고+부서 동시 결재 대기' 데이터를 새 정책에 맞게 정리.

새 정책: 모든 요청은 창고 또는 부서 중 하나로만 결재. 동시 결재는 금지.

대상:
- requires_warehouse_approval=True AND requires_department_approval=True 인
  RESERVED/SUBMITTED 상태 요청.
- request_type 이 MANUAL_ADJUSTMENT 가 아니면(=창고 승인 정상 케이스) →
  requires_department_approval=False, department_approved_* 정리.

dry-run 기본, --apply 로 실제 변경.

사용자 확인: 창고 승인까지 끝나고 부서만 대기인 케이스는 발생 가능성 0.
스크립트는 그런 케이스 발견 시 경고만 출력하고 건드리지 않음 (수동 처리 안내).

사용:
    python scripts/dev/normalize_stock_request_approvals.py            # dry-run
    python scripts/dev/normalize_stock_request_approvals.py --apply    # 실제 변경
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
```
