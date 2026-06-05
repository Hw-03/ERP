"""dept_hierarchy 단위 테스트.

2026-05-27 그릴 합의:
    "부서 정/부 = 창고 외 모든 부서 결재 가능 (생산부 전체 1쌍)"
    이전 룰("생산 6공정 한정")에서 확장됨. 비-공정 부서(경영지원/AS 등) 요청도 결재 가능.
"""

from __future__ import annotations

import pytest

from app.models import Employee, EmployeeLevelEnum
from app.services.dept_hierarchy import (
    PRODUCTION_LINES,
    approvable_departments,
    can_approve_department,
    is_production_line,
)


class TestIsProductionLine:
    def test_라인_6개는_True(self):
        for line in ("튜브", "고압", "진공", "튜닝", "조립", "출하"):
            assert is_production_line(line) is True, line

    def test_단독_부서는_False(self):
        for dept in ("영업", "연구", "AS", "기타", "경영지원"):
            assert is_production_line(dept) is False

    def test_None_또는_빈_문자열은_False(self):
        assert is_production_line(None) is False
        assert is_production_line("") is False

    def test_PRODUCTION_LINES_상수_불변(self):
        assert isinstance(PRODUCTION_LINES, frozenset)
        assert len(PRODUCTION_LINES) == 6


def _make_employee(
    *,
    department: str = "조립",
    department_role: str = "none",
    warehouse_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
) -> Employee:
    return Employee(
        employee_code="TEST",
        name="테스트",
        role="test",
        department=department,
        department_role=department_role,
        warehouse_role=warehouse_role,
        level=level,
        is_active="true",
    )


class TestCanApproveDepartment:
    def test_부서_정은_생산_6공정_OK(self):
        actor = _make_employee(department_role="primary")
        for line in PRODUCTION_LINES:
            assert can_approve_department(actor, line) is True

    def test_부서_부도_생산_6공정_OK(self):
        actor = _make_employee(department_role="deputy")
        for line in PRODUCTION_LINES:
            assert can_approve_department(actor, line) is True

    def test_부서_정부는_비_생산_부서도_OK(self):
        # 새 룰: "창고" 외 모든 부서 결재 가능
        for role in ("primary", "deputy"):
            actor = _make_employee(department_role=role)
            for dept in ("영업", "연구", "AS", "기타", "경영지원"):
                assert can_approve_department(actor, dept) is True, (role, dept)

    def test_부서_정부는_창고_부서는_거부(self):
        # 창고는 부서가 아닌 자재 보관소 — 창고 정/부만 결재
        for role in ("primary", "deputy"):
            actor = _make_employee(department_role=role)
            assert can_approve_department(actor, "창고") is False

    def test_창고_정은_모든_부서_OK(self):
        actor = _make_employee(warehouse_role="primary")
        for dept in ("튜브", "영업", "연구", "기타", "창고"):
            assert can_approve_department(actor, dept) is True

    def test_창고_부도_모든_부서_OK(self):
        actor = _make_employee(warehouse_role="deputy")
        for dept in ("진공", "AS", "창고"):
            assert can_approve_department(actor, dept) is True

    def test_admin은_모든_부서_OK(self):
        actor = _make_employee(level=EmployeeLevelEnum.ADMIN)
        for dept in ("진공", "영업", "창고"):
            assert can_approve_department(actor, dept) is True

    def test_권한_없는_직원은_모든_부서_거부(self):
        actor = _make_employee()  # 모든 role=none
        for dept in ("조립", "영업"):
            assert can_approve_department(actor, dept) is False

    def test_target_dept_None은_False(self):
        actor = _make_employee(warehouse_role="primary")
        assert can_approve_department(actor, None) is False


class TestApprovableDepartments:
    def test_창고_정부는_None(self):
        actor = _make_employee(warehouse_role="primary")
        assert approvable_departments(actor) is None
        actor2 = _make_employee(warehouse_role="deputy")
        assert approvable_departments(actor2) is None

    def test_admin은_None(self):
        actor = _make_employee(level=EmployeeLevelEnum.ADMIN)
        assert approvable_departments(actor) is None

    def test_부서_정부도_None(self):
        # 새 룰: 부서 정/부도 모든 비-창고 부서 노출
        actor_p = _make_employee(department_role="primary")
        actor_d = _make_employee(department_role="deputy")
        assert approvable_departments(actor_p) is None
        assert approvable_departments(actor_d) is None

    def test_권한_없는_직원은_빈_frozenset(self):
        actor = _make_employee()
        result = approvable_departments(actor)
        assert result == frozenset()
        assert len(result) == 0
