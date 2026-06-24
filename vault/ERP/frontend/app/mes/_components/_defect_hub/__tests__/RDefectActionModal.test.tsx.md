# RDefectActionModal.test.tsx

## 이 파일은 뭐예요?
원자재(R 타입) 불량품에 대한 처리 모달(`RDefectActionModal`)을 검증하는 테스트 파일입니다. 정상 복귀·폐기·원자재 반품 세 가지 라디오 선택지와 각 경로의 API 호출 페이로드를 확인합니다.

## 언제 보나요?
- `RDefectActionModal` 컴포넌트를 수정할 때 회귀 여부 확인
- `defectsApi.unquarantine` 또는 `stockRequestsApi.createStockRequest(request_type: "defect_scrap")` 호출 시그니처가 바뀔 때

## 중요한 내용
- 검증 대상: `RDefectActionModal` (액션: `unquarantine` / `scrap` / 원자재 반품)
- 카테고리 미선택 시 [확인 →] 버튼 비활성 확인
- 폐기 경로: `request_type: "defect_scrap"`, `from_bucket: "defective"` 포함 여부 검증
- 성공 후 `onSubmitted` + `onClose` 콜백 모두 호출 확인
- [취소] 클릭 시 `onClose`만 호출 확인

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/RDefectActionModal.tsx]] — 테스트 대상 컴포넌트
