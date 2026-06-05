---
type: file-explanation
source_path: "backend/app/services/dept_hierarchy.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# dept_hierarchy.py — dept_hierarchy.py 설명

## 이 파일은 무엇을 책임지나

`dept_hierarchy.py`는 `dept_hierarchy` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `is_production_line`
- `can_approve_department`
- `approvable_departments`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
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
```
