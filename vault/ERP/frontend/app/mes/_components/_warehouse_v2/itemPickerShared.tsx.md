# itemPickerShared.tsx

## 이 파일은 뭐예요?
`IoTargetPicker`와 `DefectItemPicker`가 공유하는 품목 필터·정렬·렌더 유틸 모음입니다. 부서 필터(`matchesDept`), 단계 필터(`matchesStage`), 모델 필터(`matchesModel`), 4단계 정렬(`sortItemsForPicker`), 부서별 재고 툴팁(`renderDeptBreakdown`) 등이 들어 있습니다.

## 언제 보나요?
- 품목 선택기(IoTargetPicker)의 필터/정렬 로직을 바꿀 때
- 불량 탭 DefectItemPicker의 정렬 우선순위를 조정할 때
- mes_code 기반으로 R(원자재)/부서 분류 로직을 확인할 때

## 중요한 내용
- `sortItemsForPicker` — 4단계 정렬: ①직원 개인 순서(employeeOrderRank) ②부서 순서(deptPriorityByLetter) ③조립 내 담당 모델 우선(assemblyRank) ④서버 원본 인덱스(stable sort)
- `matchesDept` / `matchesStage` / `matchesModel` — 순수 필터 함수
- `isRItem` — mes_code 2번째 세그먼트 끝이 'R'이면 원자재 판별
- `buildDeptPriorityByLetter` / `buildAssignedPriorityBySlot` / `buildEmployeeOrderRank` — useMemo 안에서 불리는 우선순위 맵 빌더
- `STAGE_OPTIONS` / `NAME_TO_LETTER` — 단계·부서 선택 옵션 상수

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx]] — 이 유틸을 소비하는 주 품목 선택기
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/bomDept.ts]] — `deptOf`, `stageOf`, `DeptLetter` 타입 제공처
