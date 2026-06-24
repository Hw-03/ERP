# DefectCartFlow.test.tsx

## 이 파일은 뭐예요?
다품목 불량 처리 카트(`DefectCartFlow`)를 검증하는 테스트 파일입니다. `add`(격리)·`scrap`(바로 폐기) 두 모드에서의 품목 선택, 수량·사유 입력, ConfirmModal 거쳐 API 호출, 부분 실패 시 롤백 동작을 확인합니다.

## 언제 보나요?
- `DefectCartFlow` 컴포넌트를 수정할 때 회귀 여부 확인
- add 모드의 `defectsApi.quarantine` 또는 scrap 모드의 `stockRequestsApi.createStockRequest(request_type: "scrap_normal")` 페이로드 구조가 바뀔 때

## 중요한 내용
- `useMyItemOrderQuery`(React Query 훅) 사용으로 `QueryClientProvider` 감싸는 커스텀 `render` 헬퍼 사용
- `makeItem` 헬퍼: `mes_code`에서 `process_type_code` 자동 추출(두 번째 세그먼트)
- add 모드: `source: "production"`, `source_dept === target_dept === 조립`
- scrap 모드: `from_bucket: "production"`, `to_bucket: "none"`, `request_type: "scrap_normal"`
- 부분 실패 시 실패 줄만 남기고 `onDone` 미호출·"1건 실패" 메시지 표시 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectCartFlow.tsx]] — 테스트 대상 컴포넌트
