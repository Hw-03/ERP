# ItemRow.tsx

## 이 파일은 뭐예요?
품목 한 건을 모바일 목록에서 카드형 행으로 표시하는 컴포넌트입니다. 품목명·재고량·MES 코드·부서 배지·재고 상태 배지를 조합해 보여주며, 체크박스 선택 모드와 우측 커스텀 슬롯을 지원합니다.

## 언제 보나요?
- 품목 선택 바텀시트에서 품목 목록을 표시할 때
- 입출고 위저드에서 대상 품목을 고를 때

## 중요한 내용
- `ItemRow({ item, onClick?, selected?, showCheckbox?, right?, dense?, className? })` — `Item` 타입은 `@/lib/api`에서 import
- `selected=true`이면 파란색 배경·테두리 강조
- `showCheckbox=true`이면 22×22 체크 원형 + 44×44 hit-area (WCAG 2.5.5)
- 재고 상태(`getStockState`)를 색상과 라벨로 우측에 `StatusBadge`로 표시
- 부서 배지(`mesCodeDeptBadge`)는 MES 코드에서 추출해 `StatusBadge`로 표시
- `dense=true`이면 패딩 축소(py-[10px])

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/StatusBadge.tsx]] — 재고 상태 및 부서 배지 렌더링
- [[ERP/frontend/lib/mes/inventory.ts]] — `getStockState` 재고 상태 판별 로직
- [[ERP/frontend/lib/mes/process.ts]] — `mesCodeDeptBadge` 부서 배지 추출
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useDeptColorLookup` 훅 출처
