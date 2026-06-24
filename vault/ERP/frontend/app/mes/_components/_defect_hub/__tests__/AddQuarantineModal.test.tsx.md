# AddQuarantineModal.test.tsx

## 이 파일은 뭐예요?
단일 품목 불량 격리 모달(`AddQuarantineModal`)을 검증하는 테스트 파일입니다. 품목 검색·선택, 출처(창고/부서) 선택, 수량·사유 입력 후 `defectsApi.quarantine` 호출 페이로드를 확인합니다.

## 언제 보나요?
- `AddQuarantineModal` 컴포넌트를 수정할 때 회귀 여부 확인
- 격리 출처(`source: "warehouse"` vs `"production"`) 로직이나 `source_dept` 전달 방식이 바뀔 때

## 중요한 내용
- `useMyItemOrderQuery`(React Query 훅)를 사용하므로 `QueryClientProvider`로 감싸는 커스텀 `render` 헬퍼 사용
- 창고 출처: `source: "warehouse"`, `source_dept: undefined`
- 부서 재고 출처: `source: "production"`, `source_dept === target_dept`
- 품목 선택 + 카테고리 + 수량 세 가지 모두 채워야 [격리하기] 버튼 활성화 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/AddQuarantineModal.tsx]] — 테스트 대상 컴포넌트
