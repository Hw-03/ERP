---
type: file-explanation
source_path: "_attic/scripts/dev/normalize_stock_request_approvals.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# normalize_stock_request_approvals.py — normalize_stock_request_approvals.py 설명

## 이 파일은 무엇을 책임지나

`normalize_stock_request_approvals.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `find_dual_pending`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)


def find_dual_pending(db):
    return (
        db.query(StockRequest)
        .filter(
            StockRequest.requires_warehouse_approval.is_(True),
            StockRequest.requires_department_approval.is_(True),
            StockRequest.status.in_(
                (
                    StockRequestStatusEnum.RESERVED,
                    StockRequestStatusEnum.SUBMITTED,
                )
            ),
        )
        .all()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
```
