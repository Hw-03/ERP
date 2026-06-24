# PaPfDefectWizard.test.tsx

## 이 파일은 뭐예요?
PA/PF 공정 불량품에 대한 처리 마법사(`PaPfDefectWizard`)를 검증하는 테스트 파일입니다. 정상 복귀·전부 폐기·분해 세 가지 처리 경로와 BOM 연동, 수량 분할 시 `notes` JSON 구조까지 확인합니다.

## 언제 보나요?
- `PaPfDefectWizard` 컴포넌트를 수정할 때 회귀 여부 확인
- 분해(disassembly) 경로에서 `deptAdjustmentApi.getBomTemplate` 호출 로직이나 `stockRequestsApi.createStockRequest` 페이로드 구조가 바뀔 때

## 중요한 내용
- 검증 대상: `PaPfDefectWizard` (처리 모드: `정상 복귀` / `전부 폐기` / `분해`)
- 분해 모드는 `deptAdjustmentApi.getBomTemplate`으로 BOM 자식 목록을 로드하고, 수량 분할 결과를 `notes` JSON(`child_decisions`)에 담아 `createStockRequest` 호출
- 카테고리 미선택 시 제출 버튼 비활성 검증 포함
- `ReasonFormFields`는 stub으로 대체해 테스트 격리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/PaPfDefectWizard.tsx]] — 테스트 대상 컴포넌트
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — stub 처리된 사유 입력 폼
