# RDefectActionModal.tsx

## 이 파일은 뭐예요?
R(원자재) 격리 항목을 처리하는 모달 컴포넌트다. "정상 복귀 / 폐기 / 원자재 반품" 3가지 액션을 선택하고 사유를 입력해 제출한다.

## 언제 보나요?
- 격리 목록에서 R 품목(원자재)의 [처리] 버튼을 눌렀을 때 (모달 경로)
- `createPortal`로 `document.body`에 렌더, z-index 450

## 중요한 내용
- `RAction`: `"unquarantine" | "scrap" | "return"`
- `ACTION_LABELS` / `ACTION_DESC`: 각 액션의 UI 레이블과 설명 상수
- API 호출 분기:
  - unquarantine → `defectsApi.unquarantine` (즉시)
  - scrap → `createStockRequest({ request_type: "defect_scrap" })`
  - return → `createStockRequest({ request_type: "defect_return" })`
- 폐기·반품 모두 현재는 즉시 처리 (결재 흐름 아직 미구현)
- `useFocusTrap`으로 모달 내 포커스 트랩, ESC 키 닫기 지원

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/RDefectActionPanel.tsx]] — 동일 로직의 패널 버전
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 폼
- [[ERP/frontend/lib/api/defects]] — unquarantine API
- [[ERP/frontend/lib/api/stock-requests]] — createStockRequest API
