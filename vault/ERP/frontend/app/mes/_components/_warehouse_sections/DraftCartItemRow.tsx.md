# DraftCartItemRow.tsx

## 이 파일은 뭐예요?
"작업 중" 패널에서 재고 요청 임시저장(StockRequest draft) 한 건을 카드 형태로 표시하는 컴포넌트. 요청 유형·작성 시각·품목 목록(최대 5건 미리보기)·이어서 작업/삭제 버튼을 포함한다.

## 언제 보나요?
- `DraftCartPanel`이 `drafts` 목록을 렌더링할 때
- IO 초안이 아닌 일반 재고 요청 임시저장이 있을 때

## 중요한 내용
- `DraftCartItemRow({ draft, isBusy, onContinue, onRequestDelete })` — 주요 export
- `DraftCartItemRowProps` — 인터페이스 export
- 품목 5건 초과 시 "외 N건" 텍스트로 축약 표시
- `REQUEST_TYPE_LABEL`, `formatRequestNotes` — `ioRequestLabels.ts`에서 가져옴

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx]] — 이 행을 사용하는 부모 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/ioRequestLabels.ts]] — 요청 유형 레이블 및 비고 포맷 유틸
