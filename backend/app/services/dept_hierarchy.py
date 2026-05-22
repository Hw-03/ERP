"""불량/부서 결재 권한 — 라인 상수 기반 단순 룰.

2026-05-22 불량 처리 흐름 재설계 (docs/defect-handling-redesign.md).

사용자 정의:
    "부서 결재 역할(department_role primary/deputy) = 생산 라인 6개 결재"
    영업/연구/AS 부서는 MES 안 씀 (구경용). 부서 결재 흐름 자체가 라인 6개에 한정.

파일명은 historical 이유로 유지하되 계층(parent_id) 개념은 없음.
"""

from __future__ import annotations

from typing import Iterable

PRODUCTION_LINES: frozenset[str] = frozenset(
    {"튜브", "고압", "진공", "튜닝", "조립", "출하"}
)


def is_production_line(dept_name: str | None) -> bool:
    """주어진 부서명이 생산 라인 6개 중 하나인지."""
    return bool(dept_name) and dept_name in PRODUCTION_LINES


def can_approve_department(actor, target_dept: str | None) -> bool:
    """결재자가 `target_dept` 부서 요청을 결재할 수 있는지.

    룰 (그릴 합의 — 2026-05-22):
      1. 부서 정/부 (`department_role`): 생산 라인 6개 모두 결재
      2. 창고 정/부 (`warehouse_role`): 모든 부서 결재
      3. 시스템 admin (`level=admin`): 모든 부서 결재

    한 명이 위 권한 중 하나라도 있으면 True.

    Args:
        actor: Employee — `department_role`/`warehouse_role`/`level` 속성 보유
        target_dept: 결재 대상 요청자 부서명

    Returns:
        True = 결재 가능
    """
    if not target_dept:
        return False

    dept_role = (getattr(actor, "department_role", None) or "none").lower()
    wh_role = (getattr(actor, "warehouse_role", None) or "none").lower()
    level = getattr(getattr(actor, "level", None), "value", getattr(actor, "level", None))

    # 1. 부서 정/부 → 생산 라인만
    if dept_role in ("primary", "deputy") and is_production_line(target_dept):
        return True
    # 2. 창고 정/부 → 모든 부서
    if wh_role in ("primary", "deputy"):
        return True
    # 3. admin → 모든 부서
    if level == "admin":
        return True
    return False


def approvable_departments(actor) -> Iterable[str] | None:
    """결재자가 부서 결재 큐에서 볼 수 있는 부서명 목록 (큐 조회/카운트용).

    Returns:
        - `None` = 모든 부서 (창고 정/부 / admin — 필터 없음)
        - `frozenset[str]` = 노출 대상 부서명 집합
        - 빈 frozenset = 권한 없음
    """
    wh_role = (getattr(actor, "warehouse_role", None) or "none").lower()
    level = getattr(getattr(actor, "level", None), "value", getattr(actor, "level", None))
    if wh_role in ("primary", "deputy") or level == "admin":
        return None

    dept_role = (getattr(actor, "department_role", None) or "none").lower()
    if dept_role in ("primary", "deputy"):
        return PRODUCTION_LINES
    return frozenset()
