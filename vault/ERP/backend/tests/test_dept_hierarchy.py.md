---
type: file-explanation
source_path: "backend/tests/test_dept_hierarchy.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_dept_hierarchy.py — test_dept_hierarchy.py 설명

## 이 파일은 무엇을 책임지나

`test_dept_hierarchy.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `TestIsProductionLine`
- `TestCanApproveDepartment`
- `TestApprovableDepartments`
- `_make_employee`

## 연결되는 파일

- [[ERP/backend/tests/📁_tests]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""dept_hierarchy 단위 테스트 — 라인 상수 기반 결재 권한.

2026-05-22 불량 처리 흐름 재설계 (docs/defect-handling-redesign.md).
사용자 정의: "부서 결재 역할 = 생산 라인 6개 결재".
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
        for dept in ("영업", "연구", "AS", "기타"):
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
```
