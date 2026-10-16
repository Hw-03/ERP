"""부서/창고 결재 권한 룰.

멘탈 모델 (2026-05-27 합의, 2026-10-16 역할 분리 재확정):
    - 튜브/고압/진공/튜닝/조립/출하 = 생산부의 "공정" (부서가 아님)
    - 창고 = 자재 보관소 (부서가 아님)
    - 자재 이동 한쪽이 창고면 → 창고 정/부 결재
    - 양쪽 다 비-창고면 → 생산부 정/부 결재 (소속 공정 무관)
    - 창고 결재와 생산부 결재는 독립 역할이며 겸임 시 각각 사용할 수 있음

`PRODUCTION_LINES` 상수는 6공정 도메인 어휘로 유지 (다른 모듈이 참조할 수 있음).
"""

from __future__ import annotations

from typing import Iterable

from app.models import Employee

PRODUCTION_LINES: frozenset[str] = frozenset(
    {"튜브", "고압", "진공", "튜닝", "조립", "출하"}
)

_WAREHOUSE_DEPT_NAME = "창고"


def is_production_line(dept_name: str | None) -> bool:
    """주어진 부서명이 생산 라인 6개 중 하나인지."""
    return bool(dept_name) and dept_name in PRODUCTION_LINES


def can_approve_department(actor: Employee, target_dept: str | None) -> bool:
    """결재자가 `target_dept` 부서 요청을 결재할 수 있는지.

    생산부 정/부는 소속 공정과 관계없이 비창고 결재를 처리한다.
    창고 역할이나 이전 관리자 등급만으로는 생산부 결재 권한이 생기지 않는다.
    창고 결재는 별도의 warehouse 승인 경로에서 검사한다.
    """
    if not target_dept:
        return False

    dept_role = (getattr(actor, "department_role", None) or "none").lower()
    return dept_role in ("primary", "deputy") and target_dept != _WAREHOUSE_DEPT_NAME


def approvable_departments(actor: Employee) -> Iterable[str] | None:
    """결재자가 부서 결재 큐에서 볼 수 있는 부서명 목록 (큐 조회/카운트용).

    Returns:
        - `None` = 모든 부서 (필터 없음)
        - 빈 frozenset = 권한 없음

    생산부 정/부는 소속 공정과 관계없이 전체 공정 요청을 조회한다.
    창고 역할만 가진 직원에게는 생산부 승인함을 노출하지 않는다.
    """
    dept_role = (getattr(actor, "department_role", None) or "none").lower()

    if dept_role in ("primary", "deputy"):
        return None
    return frozenset()
