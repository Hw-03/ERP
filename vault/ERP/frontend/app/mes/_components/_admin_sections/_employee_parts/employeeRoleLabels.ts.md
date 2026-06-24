# employeeRoleLabels.ts

## 이 파일은 뭐예요?
직원의 창고 결재 역할(WarehouseRole), 부서 결재 역할(DepartmentRole), 시스템 레벨(admin/manager/staff)에 대한 한국어 레이블·설명(hint)·색상(tone) 매핑 상수를 모아 둔 파일입니다.

## 언제 보나요?
- 직원 편집 폼의 역할 드롭다운 선택지 및 역할 설명 텍스트를 렌더할 때
- 새로운 역할 값이 추가되거나 레이블/색상을 변경해야 할 때

## 중요한 내용
- `ASSEMBLY_DEPT = "조립"`: 조립 부서 고정 문자열 상수. 담당 모델 슬롯 노출 여부 판단에 사용
- `WAREHOUSE_ROLE_LABEL`: `none`/`primary`/`deputy` → `{ label, hint, tone }`. primary=파란색(창고 주담당), deputy=청록(보조)
- `DEPARTMENT_ROLE_LABEL`: `none`/`primary`/`deputy` → `{ label, hint, tone }`. primary=초록(부서 주담당), deputy=보라(보조)
- `LEVEL_LABEL`: `admin`/`manager`/`staff` → `{ label, hint, tone }`. 현재 직원 편집 UI에서는 직접 사용되지 않으나 다른 곳에서 참조 가능

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeDetailGrid.tsx]] — WAREHOUSE_ROLE_LABEL·DEPARTMENT_ROLE_LABEL·ASSEMBLY_DEPT 사용처
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeAddInline.tsx]] — 동일 상수 사용처
- [[ERP/frontend/lib/api.ts]] — WarehouseRole·DepartmentRole 타입 정의 위치
