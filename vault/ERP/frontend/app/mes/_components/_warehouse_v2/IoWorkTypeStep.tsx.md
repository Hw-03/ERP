# IoWorkTypeStep.tsx

## 이 파일은 뭐예요?
입출고 위저드 Step 1(작업 유형 선택)과 Step 2(세부 작업/부서 선택) UI를 담당하는 컴포넌트 파일입니다. 큰 카드(IoWorkTypeStep) 3종과 세부 선택(IoSubTypeStep) — 부서 그리드·방향 카드를 렌더합니다.

## 언제 보나요?
- 입출고 위저드가 Step 1(작업 유형 선택) 상태일 때
- 위저드가 Step 2(세부 작업 · 부서 선택) 상태일 때
- process 워크타입에서 입고/출고 방향(DirectionCard)을 선택할 때

## 중요한 내용
- `IoWorkTypeStep` — `IoWorkType` 카드 목록 렌더. `canSeeWorkType`으로 원자재 입고(receive)를 창고 담당자만 노출
- `IoSubTypeStep` — `process` 일 때 부서 그리드 + 방향 카드, 그 외엔 세부 작업 칩 + 부서 그리드
- `DeptGrid` — 6(또는 7)개 부서 선택 버튼 그리드; `MES_DEPARTMENT_COLORS`로 부서별 색상 적용
- `DirectionCard` — `in`(생산 입고) / `out`(분해 출고) 방향 선택 카드

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — `IO_WORK_TYPES`, `IO_SUB_TYPES`, `canSeeWorkType`, `requiresDepartments`, `deptVisibility` 등 모든 도메인 상수/함수 소스
- [[ERP/frontend/app/mes/_components/_warehouse_v2/types.ts]] — `IoWorkType`, `IoSubType`, `OperatorLike` 타입
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 이 컴포넌트를 Step 1/2 콘텐츠로 소비하는 최상위 위저드
