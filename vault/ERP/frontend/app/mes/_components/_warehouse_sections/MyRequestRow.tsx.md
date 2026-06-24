# MyRequestRow.tsx

## 이 파일은 뭐예요?
"내 요청" 패널에서 재고 요청 한 건을 카드로 표시하는 컴포넌트. 요청 유형·상태 배지·품목 목록(5건 이상 더보기 접기)·비고·반려 사유를 보여주고, 취소 및 수정(승인 전 draft 전환) 버튼을 제공한다.

## 언제 보나요?
- `MyRequestsPanel`이 `items` 목록을 렌더링할 때
- 본인이 제출한 요청의 현황을 확인하거나 취소·수정할 때

## 중요한 내용
- `MyRequestRow({ req, onCancelRequest, onRevertToDraft })` — 주요 export
- `STATUS_LABEL` / `STATUS_COLOR` — draft·submitted·reserved·rejected·cancelled·completed·failed_approval 상태 표시 사전
- `cancelable` — `status === "submitted" || status === "reserved"`일 때 취소·수정 버튼 노출
- `onRevertToDraft` — 승인 전 요청을 draft로 되돌려 수정 가능하게 하는 콜백
- 5건 초과 품목은 "더보기/접기" 토글

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx]] — 이 행을 목록으로 사용하는 부모 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/ioRequestLabels.ts]] — `REQUEST_TYPE_LABEL`, `formatRequestNotes` 제공
