# DefectBatchConfirm.tsx

## 이 파일은 뭐예요?
격리 항목 여러 건을 한 번에 처리(정상 복귀·폐기·반품)하는 일괄 처리 확인 화면이다. 줄마다 사유를 입력하고 "위 사유 복사" 버튼으로 아래 행에 일괄 적용한 뒤 `Promise.allSettled`로 행별 단건 API를 병렬 호출한다.

## 언제 보나요?
- 격리 목록에서 여러 항목을 체크박스로 선택 후 일괄 처리 버튼을 누를 때
- 전폭 화면으로 전환됨 (별도 모달 아님)

## 중요한 내용
- `BatchAction`: `"unquarantine" | "scrap" | "return"`
- `ReasonRow`: 행별 `{ category, memo, qty }` 상태 (정상복귀는 qty 수정 가능)
- `RowFailure`: 처리 실패 행의 key + 메시지 → 실패 행만 빨간 테두리 표시
- `allValid`: 모든 행에 카테고리 입력, 정상복귀면 qty 범위도 검사
- `copyDown(index)`: index 행의 사유를 이하 모든 행에 복사
- `handleSubmit`: `Promise.allSettled` → 실패 건 수집 → 실패 있으면 목록 유지 + 에러 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 행별 사유 폼
- [[ERP/frontend/lib/api/defects]] — unquarantine API
- [[ERP/frontend/lib/api/stock-requests]] — defect_scrap / defect_return API
