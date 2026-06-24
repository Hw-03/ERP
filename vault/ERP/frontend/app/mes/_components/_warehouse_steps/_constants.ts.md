# _constants.ts

## 이 파일은 뭐예요?
입출고 위저드 전체에서 공유되는 타입 정의, 상수, 헬퍼 함수를 모아놓은 파일입니다. 작업유형(`WorkType`), 방향(`Direction`), 부서 목록, 작업자 권한 매트릭스 등 위저드 로직의 핵심 기반이 됩니다.

## 언제 보나요?
- 입출고 위저드에서 `WorkType`이 어떻게 분류되는지 확인할 때
- 작업자 권한(창고직원 vs 생산부서)에 따라 어떤 작업유형이 표시되는지 파악할 때
- `PROCESS_TYPE_LABEL`에서 공정 코드(TR, AF 등) → 한국어 레이블 매핑을 확인할 때

## 중요한 내용
- **타입**: `WorkType` (`raw-io` · `warehouse-io` · `dept-adjustment` · `defective-register`), `Direction`, `TransferDirection`, `DefectiveSource`
- **상수**:
  - `PAGE_SIZE = 100` — 품목 목록 페이지 크기
  - `PROD_DEPTS` — 생산부서 6개 배열 (튜브/고압/진공/튜닝/조립/출하)
  - `WORK_TYPES` — id·label·icon·description 목록
  - `CAUTION_WORK_TYPES` — 주의 표시가 필요한 작업유형 (`defective-register`)
  - `DEPT_OPTIONS` — 부서 필터 드롭다운 옵션
  - `PROCESS_TYPE_LABEL` — 공정 코드 → 한국어 레이블 Record (TR/TA/TF … PF 18종)
- **헬퍼 함수**:
  - `getDeptOptionsForOperator(operatorDept?)` — 작업자 소속 부서를 목록 상단으로 끌어올림
  - `matchesSearch(item, keyword)` — 품목 검색 매칭
  - `workTypeNeedsDept(wt)` — 해당 작업유형에 부서 선택이 필요한지 여부
  - `isWarehouseStaff(op)` — 창고 직원(primary/deputy) 여부
  - `isDepartmentApprover(op)` — 부서 결재권자 여부
  - `canEnterIO(op)` — 입출고 화면 진입 가드 (`io_enabled !== false`)
  - `workTypesForOperator(op)` — 작업자 역할에 따른 허용 작업유형 목록 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_steps/index.ts]] — 이 파일의 내용을 외부에 재익스포트
- [[ERP/frontend/lib/itemSearch.ts]] — `matchesItemSearch` 유틸 (matchesSearch 내부 사용)
- [[ERP/frontend/lib/api.ts]] — `Department`, `DepartmentRole`, `EmployeeLevel`, `Item`, `WarehouseRole` 타입 출처
