# MobileSingleAdjustForm.tsx

## 이 파일은 뭐예요?
단품 입고(`adjust_in`) 또는 단품 출고(`adjust_out`) 전용 모바일 인라인 폼입니다. 5단계 위저드를 거치지 않고 검색 → 수량 스테퍼 → 제출 버튼까지 한 화면에서 처리합니다.

## 언제 보나요?
- 모바일에서 단품 입출고 흐름이 이상하게 동작할 때
- 단품 입출고 검색 결과, 장바구니, 스테퍼 UI를 수정해야 할 때
- 스캔 버튼이 숨겨져 있는 이유를 확인할 때 (코드 주석 "항목 8 — 당분간 hidden")

## 중요한 내용
- export: `MobileSingleAdjustForm` (named export)
- props: `subType`(`adjust_in` | `adjust_out`), `items`, `bundles`, `onAddItem`, `onBundleQuantityChange`, `onRemoveBundle`, `getAvailable`, `onSubmit` 등
- 제출/재고 계산은 위저드의 함수(`addItem`, `getAvailable`, `handleSubmit`)를 prop으로 받아 재사용 — 자체 상태 없음
- 스캔 버튼(`ScanLine` 아이콘)은 `hidden` 처리로 UI에서 숨겨져 있으나 코드와 `onScan` prop은 유지됨
- 출고(`adjust_out`)일 때 `getAvailable`로 가용 재고를 계산해 `Stepper`의 `max`로 전달

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx]] — 이 폼을 렌더하는 위저드 컨테이너
- [[ERP/frontend/app/mes/_components/mobile/primitives/📁_primitives]] — `InlineSearch`, `IconButton`, `Stepper`, `PrimaryActionButton` 공급처
