# dept_hierarchy.py

## 이 파일은 뭐예요?

불량 처리·부서 결재 권한 판단 유틸리티. 파일명은 `dept_hierarchy`이지만 **계층(parent_id) 개념은 없다.** 생산 라인 6개를 상수로 정의하고, 결재 가능 여부를 단순 룰로 판단한다.

> 2026-05-22 불량 처리 흐름 재설계 그릴 합의 결과 작성됨. 설계 상세는 `docs/defect-handling-redesign.md` 참조.

## 언제 보나요?

- "이 직원이 저 부서 요청을 결재할 수 있나?" 확인할 때
- 결재 큐에서 어떤 부서가 노출되는지 확인할 때
- 부서 결재 라우팅 버그를 추적할 때

## 핵심 상수 & 함수

### `PRODUCTION_LINES`

```python
PRODUCTION_LINES: frozenset[str] = frozenset(
    {"튜브", "고압", "진공", "튜닝", "조립", "출하"}
)
```

생산 라인 6개. 영업/연구/AS 부서는 MES를 사용하지 않으므로 포함되지 않는다.

### `can_approve_department(actor, target_dept)` — 결재 가능 여부

| 역할 | 결재 범위 |
|------|----------|
| `department_role = primary/deputy` | 생산 라인 6개만 |
| `warehouse_role = primary/deputy` | 모든 부서 |
| `level = admin` | 모든 부서 |

세 조건 중 하나라도 해당하면 `True`.

### `approvable_departments(actor)` — 결재 큐 부서 필터

| 반환값 | 의미 |
|--------|------|
| `None` | 창고 정/부 또는 admin — 모든 부서 표시 |
| `frozenset(생산라인 6개)` | 부서 정/부 — 생산 라인만 표시 |
| `frozenset()` (빈 집합) | 권한 없음 — 큐 비어 보임 |

## 주의사항

> [!warning]
> - 생산부 산하 6라인에는 별도 부서장이 없다. 이필욱·김건호가 6라인 결재를 모두 처리한다.
> - "자기 부서 부서장만 결재 가능" 가정 금지. `can_approve_department` 룰이 기준이다.

## 연결되는 파일

- [[ERP/backend/app/models.py]] — Employee, DepartmentEnum
- [[ERP/backend/app/routers/defects.py]] — 불량 처리 라우터
- `docs/defect-handling-redesign.md` — 설계 원본
