# ReasonFormFields.tsx

## 이 파일은 뭐예요?
불량 처리 공통 사유 폼 컴포넌트다. `REASON_CATEGORIES` 상수 기반 select와 자유 메모 textarea 2개 필드로 구성되며, `RDefectActionModal`, `PaPfDefectWizard`, `DefectBatchConfirm` 등 여러 곳에서 동일하게 임포트해 사용한다.

## 언제 보나요?
- 불량 처리 관련 모든 폼에서 사유 입력 섹션이 필요할 때

## 중요한 내용
- `ReasonFormFieldsProps`: `category`, `memo`, `onCategoryChange`, `onMemoChange`, `required?`
- `required=true` 이면 카테고리 미선택 시 빨간 테두리 + 오류 문구 표시
- 카테고리 옵션: `REASON_CATEGORIES` (외관 불량·치수 불량·기능 불량·검사 통과·기타)
- 메모는 항상 선택 항목

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/reasonCategories.ts]] — 카테고리 상수
