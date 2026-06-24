# ioRequestLabels.ts

## 이 파일은 뭐예요?
입출고 요청 유형 표시 레이블 사전(`REQUEST_TYPE_LABEL`)과 비고 필드 포맷 함수(`formatRequestNotes`)를 `DraftCartItemRow`·`WarehouseQueueRow`·`MyRequestRow` 세 컴포넌트에 공용으로 제공하는 유틸 파일. 실제 단일 사전은 `lib/io/glossary.ts`에 있고 이 파일은 backward-compat re-export.

## 언제 보나요?
- 요청 유형 한국어 레이블이 필요한 컴포넌트에서 import할 때
- 비고(notes) 필드에 구조화 JSON이 저장된 경우 사람이 읽을 텍스트로 변환이 필요할 때

## 중요한 내용
- `REQUEST_TYPE_LABEL: Record<string, string>` — `lib/io/glossary.ts`의 사전을 re-export
- `formatRequestNotes(notes)` — 일반 텍스트는 그대로 반환, JSON이면 `child_decisions` 건수와 `reason_memo`/`memo` 필드만 추출해 요약 문자열 반환 (없으면 null)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/io/glossary.ts]] — 실제 `REQUEST_TYPE_LABEL` 단일 정의 위치
- [[ERP/frontend/app/mes/_components/_warehouse_sections/DraftCartItemRow.tsx]] — 이 파일을 사용하는 컴포넌트 중 하나
