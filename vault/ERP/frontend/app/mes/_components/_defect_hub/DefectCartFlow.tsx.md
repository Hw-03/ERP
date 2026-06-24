# DefectCartFlow.tsx

## 이 파일은 뭐예요?
불량 격리(add) 또는 정상재고 즉시 폐기(scrap)를 여러 품목에 대해 일괄 처리하는 2단계 전폭 흐름 컴포넌트다. 1단계에서 출처·부서를 선택하고, 2단계에서 `DefectItemPicker`로 품목을 담아 장바구니 방식으로 처리한다.

## 언제 보나요?
- 불량 허브 카드에서 "불량 격리" 또는 "바로 폐기"를 선택했을 때 (데스크톱 전폭 뷰)
- `DefectCartMode = "add" | "scrap"` 으로 구분

## 중요한 내용
- `DefectCartMode`: `"add"` = 격리, `"scrap"` = 즉시 폐기
- 2단계 플로: Step 1(출처·부서 카드 선택) → `window.history.pushState` → Step 2(품목 장바구니)
- `CartLine`: `{ key, item, qty, category, memo }` — 장바구니 한 줄
- `copyReasonDown(index)`: 해당 행 아래의 모든 행에 사유 복사
- `submitLine` 분기:
  - add → `defectsApi.quarantine`
  - scrap → `stockRequestsApi.createStockRequest({ request_type: "scrap_normal" })`
- `Promise.allSettled`: 실패 행만 남기고 성공 행 제거 후 에러 표시
- `ConfirmModal` 으로 최종 확인 후 제출
- `popstate` 이벤트 수신으로 브라우저 뒤로가기 시 Step 1로 복귀

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectItemPicker.tsx]] — 품목 선택 테이블
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 행별 사유 폼
- [[ERP/frontend/lib/api/defects]] — quarantine API
- [[ERP/frontend/lib/api/stock-requests]] — scrap_normal API
