"""부서/창고 결재 권한 룰.

멘탈 모델 (2026-05-27 그릴 합의):
    - 튜브/고압/진공/튜닝/조립/출하 = 생산부의 "공정" (부서가 아님)
    - 창고 = 자재 보관소 (부서가 아님)
    - 자재 이동 한쪽이 창고면 → 창고 정/부 결재
    - 양쪽 다 비-창고면 → 부서 정/부 결재 (대상 부서 무관)
    - 부서 정/부는 생산부 전체 1쌍 (현재 이필욱·김건호)

`PRODUCTION_LINES` 상수는 6공정 도메인 어휘로 유지 (다른 모듈이 참조할 수 있음).
"""

from __future__ import annotations

from typing import Iterable

PRODUCTION_LINES: frozenset[str] = frozenset(
    {"튜브", "고압", "진공", "튜닝", "조립", "출하"}
)

_WAREHOUSE_DEPT_NAME = "창고"


def is_production_line(dept_name: str | None) -> bool:
    """주어진 부서명이 생산 라인 6개 중 하나인지."""
    return bool(dept_name) and dept_name in PRODUCTION_LINES


def can_approve_department(actor, target_dept: str | None) -> bool:
    """결재자가 `target_dept` 부서 요청을 결재할 수 있는지.

    룰 (2026-05-27 그릴 합의):
      1. 부서 정/부 (`department_role`): "창고" 외 모든 부서 결재 가능
      2. 창고 정/부 (`warehouse_role`): 모든 부서 결재 (창고 포함)
      3. 시스템 admin (`level=admin`): 모든 부서 결재

    한 명이 위 권한 중 하나라도 있으면 True.
    """
    if not target_dept:
        return False

    dept_role = (getattr(actor, "department_role", None) or "none").lower()
    wh_role = (getattr(actor, "warehouse_role", None) or "none").lower()
    level = getattr(getattr(actor, "level", None), "value", getattr(actor, "level", None))

    if dept_role in ("primary", "deputy") and target_dept != _WAREHOUSE_DEPT_NAME:
        return True
    if wh_role in ("primary", "deputy"):
        return True
    if level == "admin":
        return True
    return False


def approvable_departments(actor) -> Iterable[str] | None:
    """결재자가 부서 결재 큐에서 볼 수 있는 부서명 목록 (큐 조회/카운트용).

    Returns:
        - `None` = 모든 부서 (필터 없음)
        - 빈 frozenset = 권한 없음

    부서 정/부도 새 룰에선 모든 비-창고 부서를 결재하므로 None 반환.
    `requester_department`에 "창고"가 들어올 일은 없어(직원 소속 부서 기반) 별도 제외 불필요.
    """
    wh_role = (getattr(actor, "warehouse_role", None) or "none").lower()
    dept_role = (getattr(actor, "department_role", None) or "none").lower()
    level = getattr(getattr(actor, "level", None), "value", getattr(actor, "level", None))

    if (
        wh_role in ("primary", "deputy")
        or dept_role in ("primary", "deputy")
        or level == "admin"
    ):
        return None
    return frozenset()
