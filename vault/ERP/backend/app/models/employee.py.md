---
type: file-explanation
source_path: "backend/app/models/employee.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# employee.py — 직원·부서·담당 모델 배정 표

## 이 파일은 무엇을 책임지나

직원(Employee), 부서(Department), 그리고 직원이 어떤 제품 모델을 담당하는지(EmployeeAssignedModel) 를 정의합니다. 누가 입출고를 찍을 수 있고, 누가 결재 권한을 갖는지의 기준 데이터입니다.

## 업무 흐름에서의 의미

현장에서 작업자를 고르고 PIN 을 누르는 그 직원이 여기 Employee 행입니다. 입출고 권한, 창고/부서 결재 역할, 담당 모델 우선순위 같은 "누가 무엇을 할 수 있나" 가 전부 이 표의 칸으로 결정됩니다.

## 언제 보면 좋나

- 직원 권한(입출고 가능 여부, 결재 역할)이 어떻게 저장되는지 확인할 때
- 부서별 입출고 허용(io_enabled)이 어디서 정해지는지 볼 때
- 조립 부서에서 담당 모델 부품이 왜 목록 위로 올라오는지 이해할 때

## 중요한 내용

- `EmployeeLevelEnum` — 시스템 권한 등급: `admin` / `manager` / `staff`. (이건 결재 업무 역할과는 별개입니다.)
- `Department` — 부서. 이름·표시순서·활성여부·색(color_hex)·`io_enabled`(부서 단위 입출고 허용).
- `Employee` — 직원. 주요 칸:
  - `employee_code` : 사번(유일).
  - `level` : 시스템 권한 등급.
  - `warehouse_role` : 창고 결재 역할(none/primary/deputy).
  - `department_role` : 부서 결재 역할(none/primary/deputy). 낱개 IO 승인 권한. warehouse_role 과 별개.
  - `io_enabled` : 직원별 입출고 권한 토글. 부서 io_enabled 와 AND(둘 다 켜져야 가능).
  - `is_active` : 활성 여부. DB 에는 'true'/'false' 문자열로 저장되지만 코드에선 bool 로 다룹니다(BoolAsString).
  - `pin_hash` : 작업자 식별용 PIN 해시(보안 인증이 아닌 식별용). 없으면 기본 PIN 0000.
- `EmployeeAssignedModel` — 직원 ↔ 제품(slot) 다대다. 조립 직원에게 담당 모델을 지정하면 입출고 목록에서 그 모델 부품이 위로 올라옵니다. `priority` 가 작을수록 위(0 이 1순위).

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/base.py]] — is_active 의 BoolAsString, UUID 저장 타입.
- [[ERP/backend/app/models/code.py]] — 담당 모델 배정이 가리키는 ProductSymbol.slot.
- [[ERP/backend/app/models/stock_request.py]] — 결재 권한(warehouse_role/department_role)이 쓰이는 곳.

## 조심할 점

`warehouse_role` 과 `department_role` 은 시스템 권한 등급(level)과 완전히 다른 "업무 역할" 입니다. 또 입출고 가능 여부는 직원 io_enabled 와 부서 io_enabled 가 둘 다 켜져야(AND) 합니다 — 한쪽만 보고 판단하면 안 됩니다. 결재 역할 칸은 CheckConstraint 로 허용값(none/primary/deputy)이 강제됩니다.

## 핵심 발췌

```python
warehouse_role = Column(String(20), nullable=False, default="none", ...)   # 창고 결재
department_role = Column(String(20), nullable=False, default="none", ...)  # 부서 결재
io_enabled = Column(Boolean, nullable=False, default=True, ...)            # 부서 io_enabled 와 AND
```
