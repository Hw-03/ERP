# AddRDirectModal.tsx

## 이 파일은 뭐예요?
정상 재고(창고 또는 부서)에서 격리 단계를 거치지 않고 즉시 폐기 처리하는 모달 컴포넌트다. 제출 시 `stockRequestsApi.createStockRequest({ request_type: "scrap_normal" })`을 호출하고 백엔드가 즉시 COMPLETED로 처리한다.

## 언제 보나요?
- 불량 허브에서 "바로 폐기" 카드를 선택했을 때 (단품 모달 경로)
- 창고 재고 또는 특정 부서 재고의 품목을 격리 없이 바로 폐기해야 할 때

## 중요한 내용
- `AddRDirectModalProps`: `open`, `mode: "scrap"`, `onClose`, `currentEmployee`, `onSubmitted`
- `SourceKind`: `"warehouse" | "production"` — 창고 재고 또는 부서 재고 선택
- `PRODUCTION_LINES`: 튜브/고압/진공/튜닝/조립/출하 6라인 상수
- 폼 초기화: `open` 변경 시 모든 상태 리셋
- 품목 검색: 200ms debounce, AbortController로 중복 요청 취소
- 가용 재고(`available`): 창고 출처는 `warehouse_qty`, 부서 출처는 `locations` 배열에서 해당 부서 PRODUCTION 상태 수량
- `canSubmit` 조건: 품목 선택, 카테고리 입력, 수량 > 0, 가용 재고 이하
- 2중 확인: `ConfirmModal` (tone="danger") → `handleConfirmedSubmit`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 카테고리/메모 폼
- [[ERP/frontend/app/mes/_components/_defect_hub/InlineErrorNote.tsx]] — 인라인 에러 표시
- [[ERP/frontend/app/mes/_components/_defect_hub/defectHubCards.ts]] — 허브 카드 ID 정의
- [[ERP/frontend/lib/api/stock-requests]] — createStockRequest API
