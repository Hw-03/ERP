# MobileWorkTypeStep.tsx

## 이 파일은 뭐예요?
모바일 입출고 위저드의 Step 1(작업 유형 선택)과 Step 2(세부 작업 + 부서/방향 선택) UI를 담당하는 파일입니다. 데스크톱 `IoWorkTypeStep` / `IoSubTypeStep`의 데이터·권한 로직은 그대로 재사용하고 레이아웃만 모바일용 1열 카드 / 그리드로 다시 그립니다.

## 언제 보나요?
- 모바일 입출고 Step 1·2 화면(작업 유형, 세부 작업, 부서 그리드, 방향 버튼)이 깨지거나 동작이 이상할 때
- 부서 목록(`PROD_DEPTS`) 또는 방향(in/out) 버튼 UI를 수정해야 할 때
- 불량 격리·공급업체 반품 경고 문구를 변경해야 할 때

## 중요한 내용
- export: `MobileWorkTypeStep`, `MobileSubTypeStep` (named export 2개)
- 내부 helper: `Label`, `DeptGrid` (비공개)
- `PROD_DEPTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"]` 하드코딩 — 부서 추가 시 여기도 수정 필요
- 권한 필터: `canSeeWorkType(row.id, operator)`로 operator 권한에 따라 표시 항목 자동 필터
- `defect_quarantine` / `supplier_return` subType은 하단에 빨간 경고 문구 자동 표시
- 입출고 방향(blue=입고, red=출고): `isExitWorkType`으로 판별

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — `IO_WORK_TYPES`, `IO_SUB_TYPES`, `canSeeWorkType`, `deptVisibility`, `requiresDepartments` 원본
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx]] — 이 컴포넌트를 Step 1·2로 사용하는 위저드
