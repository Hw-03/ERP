# itemPickerSort.golden.test.ts

## 이 파일은 뭐예요?
`itemPickerShared.ts`의 `sortItemsForPicker` 함수가 적용하는 4단계 정렬(직원 개인 순서 → 부서 우선순위 → 조립 그룹 내 assemblyRank → 원본 인덱스)을 고정하는 골든 테스트. `IoTargetPicker`/`DefectItemPicker`에서 인라인 복제돼 있던 정렬을 순수함수로 추출한 뒤 회귀를 막기 위해 작성되었다.

## 언제 보나요?
- `itemPickerShared.ts`의 `sortItemsForPicker` 정렬 로직을 수정할 때
- 품목 picker 정렬 우선순위(개인 순서 > 부서 > 조립 담당 모델 > 서버 순서) 규칙을 확인할 때

## 중요한 내용
- 정렬 4단계: 1)직원 rank (미지정=+Infinity) → 2)부서 priority (letter 없음=999) → 3)조립(A) 그룹 내 assignedPriorityBySlot 최솟값 (비A 그룹은 무시) → 4)원본 idx
- `employeeOrderRank`가 가장 강한 정렬 기준
- assemblyRank는 process_type_code가 "A"로 시작하는 품목에만 적용
- 맵이 모두 비어도 원본 배열 순서를 안정적으로 유지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/itemPickerShared.tsx]] — 테스트 대상 `sortItemsForPicker` 원본
