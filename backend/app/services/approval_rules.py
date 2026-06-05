"""결재 규칙 단일 원천(single source of truth).

입출고 배치가 (a) 창고 결재 (b) 부서 결재 (c) 즉시 반영 중 무엇을 타는지 결정하는
규칙 상수를 한 곳에 모은다. 이전에는 같은 집합이 여러 모듈에 손으로 복제되어 있었다
(`MANUAL_LINE_ORIGINS` 가 io_preview·sr_validation 두 곳, `APPROVAL_SUB_TYPES` 는 io_preview).

프론트엔드의 대응 규칙과도 동기화 대상이다:
- `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts`
  - `MANUAL_ORIGINS`            ↔ `MANUAL_LINE_ORIGINS`
  - `requiresApproval` 의 sub_type ↔ `WAREHOUSE_APPROVAL_SUB_TYPES`
FE↔BE 일치는 `tests/test_approval_rules_drift.py` 가 자동 검사한다(ADR-0005).
"""

from __future__ import annotations

# 창고 정/부 승인이 필요한 sub_type(프론트 requiresApproval 과 동일 집합).
WAREHOUSE_APPROVAL_SUB_TYPES: frozenset[str] = frozenset(
    {"warehouse_to_dept", "dept_to_warehouse"}
)

# 결재가 필요한 전체 sub_type(창고 승인 + 불량 격리).
# 불량 격리(defect_quarantine)는 io 배치 경로에서 결재 대상으로 표시된다.
APPROVAL_SUB_TYPES: frozenset[str] = WAREHOUSE_APPROVAL_SUB_TYPES | frozenset(
    {"defect_quarantine"}
)

# 낱개 라인 origin — 1라인이라도 포함되면 부서 결재 정/부 승인이 필요.
# 프론트 IoLine.origin / ioWorkType.MANUAL_ORIGINS 와 동기화.
MANUAL_LINE_ORIGINS: frozenset[str] = frozenset({"manual", "adjust_in", "adjust_out"})
