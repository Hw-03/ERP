# RDefectActionPanel.tsx

## 이 파일은 뭐예요?
`RDefectActionModal`의 마스터-디테일 패널 버전이다. `createPortal` + fixed overlay를 제거하고 폼·검증·제출 로직은 100% 동일하게 보존한다. 데스크톱 마스터-디테일 레이아웃의 디테일 영역에서 R 품목 처리에 사용된다.

## 언제 보나요?
- 데스크톱 불량 목록에서 R(원자재) 항목을 선택해 우측 패널에 처리 폼이 뜰 때
- `location.item_id + department` 변경 시 폼 자동 초기화

## 중요한 내용
- `RDefectActionPanelProps`: `location`, `currentEmployee`, `onSubmitted`, `onClose`
- `RDefectActionModal`과 API 로직 동일 (unquarantine / defect_scrap / defect_return)
- 폐기·반품 현재 즉시 처리 (주석: "결재 흐름이 아직 미구현")
- 자체 `flex-1 overflow-y-auto` 스크롤 영역 보유

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/RDefectActionModal.tsx]] — 모달 버전 (동일 로직)
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 폼
- [[ERP/frontend/lib/api/defects]] — unquarantine API
