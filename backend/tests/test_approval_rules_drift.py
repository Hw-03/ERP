"""FE↔BE 결재 규칙 drift 가드 (ADR-0005).

`app.services.approval_rules`(BE 단일 원천)와 프론트 `ioWorkType.ts` 의 대응 규칙이
일치하는지 검사한다. 한쪽만 바뀌면 실패 → 손으로 동기화하던 규칙의 drift 를 자동 탐지.

이전에는 같은 집합이 io_preview·sr_validation·ioWorkType.ts 에 손으로 복제되어 있었다.
"""

import re
from pathlib import Path

from app.services.approval_rules import (
    MANUAL_LINE_ORIGINS,
    WAREHOUSE_APPROVAL_SUB_TYPES,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_IO_WORK_TYPE_TS = _REPO_ROOT / "frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts"


def _ts() -> str:
    return _IO_WORK_TYPE_TS.read_text(encoding="utf-8")


def _strings_in(block: str) -> set[str]:
    return set(re.findall(r'"([^"]+)"', block))


def _match(pattern: str) -> str:
    m = re.search(pattern, _ts(), re.DOTALL)
    assert m, f"ioWorkType.ts 에서 패턴 미발견(FE 리네임?): {pattern}"
    return m.group(1)


def test_manual_origins_fe_be_parity():
    """FE MANUAL_ORIGINS == BE MANUAL_LINE_ORIGINS."""
    fe = _strings_in(_match(r"MANUAL_ORIGINS\s*=\s*new Set\(\[(.*?)\]\)"))
    assert fe == set(MANUAL_LINE_ORIGINS), (
        f"낱개 라인 origin drift — FE {sorted(fe)} != BE {sorted(MANUAL_LINE_ORIGINS)}. "
        "approval_rules.MANUAL_LINE_ORIGINS 와 ioWorkType.MANUAL_ORIGINS 를 함께 갱신할 것."
    )


def test_warehouse_approval_sub_types_fe_be_parity():
    """FE requiresApproval 의 sub_type == BE WAREHOUSE_APPROVAL_SUB_TYPES."""
    fe = _strings_in(_match(r"requiresApproval[^{]*\{[^}]*\[(.*?)\]\.includes"))
    assert fe == set(WAREHOUSE_APPROVAL_SUB_TYPES), (
        f"창고 결재 sub_type drift — FE {sorted(fe)} != BE {sorted(WAREHOUSE_APPROVAL_SUB_TYPES)}. "
        "approval_rules.WAREHOUSE_APPROVAL_SUB_TYPES 와 ioWorkType.requiresApproval 을 함께 갱신할 것."
    )
