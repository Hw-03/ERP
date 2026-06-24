# MobileDefectCartFlow.tsx

## 이 파일은 뭐예요?
불량 격리(`add`) 또는 바로 폐기(`scrap`) 모드로 여러 품목을 한 번에 처리하는 모바일 전용 2단계 흐름. Step 1에서 출처(부서 재고/창고 재고)와 대상 부서를 선택하고, Step 2에서 품목을 장바구니에 담아 수량·사유를 입력한 뒤 일괄 제출한다. 부분 실패 시 실패 줄만 남긴다.

## 언제 보나요?
- `DefectHubPanel`에서 "불량 격리" 또는 "바로 폐기" 버튼을 눌렀을 때
- `MobileDefectScreen` 안에서 모달/전환 형태로 렌더됨

## 중요한 내용
- `MobileDefectCartFlow({ mode, items, productModels, currentEmployee, defaultSource, onDone, onCancel })` — 기본 export
- `DefectCartMode` — `"add" | "scrap"` (데스크톱 `DefectCartFlow`의 타입과 동일)
- `CartLine` — `{ key, item, qty, category, memo }` 장바구니 한 줄
- `copyReasonDown(index)` — 해당 줄의 사유를 아래 모든 줄에 복사하는 편의 기능
- `submitLine` — `mode === "add"`면 `defectsApi.quarantine`, `mode === "scrap"`면 `stockRequestsApi.createStockRequest("scrap_normal")`
- `handleSubmit` — `Promise.allSettled`로 병렬 제출, 실패한 줄만 다시 장바구니에 남김
- `makeClientRequestId` — 중복 제출 방지용 클라이언트 요청 ID
- 데스크톱 `DefectCartFlow`와 동명 분리 정책 — 서로 건드리지 않음

## 위험도
🔴 높음 — 여러 품목의 불량 격리 또는 즉시 폐기를 동시에 API로 처리하며, 폐기는 되돌릴 수 없음.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectCartFlow.tsx]] — 데스크톱 동명 컴포넌트(참고용)
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectItemPicker.tsx]] — Step 2 품목 검색·선택 UI
- [[ERP/frontend/lib/api/defects.ts]] — `defectsApi.quarantine`
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stockRequestsApi.createStockRequest`
