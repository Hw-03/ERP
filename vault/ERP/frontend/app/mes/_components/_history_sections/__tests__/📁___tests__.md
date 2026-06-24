# 📁 __tests__

## 이 폴더는 뭐예요?
`_history_sections` 폴더 안의 유틸 함수들을 대상으로 하는 Vitest 테스트 파일 모음입니다. 입출고 내역 화면의 라벨·부호·스코프·날짜 포맷 등 핵심 공개 함수의 출력을 골든 테스트로 고정해 회귀를 막습니다.

## 언제 여기를 보나요?
- History 유틸 함수(`historyBatchInterpreter`, `transactionTaxonomy`, `historyQuery` 등)를 수정한 뒤 테스트가 깨졌는지 확인할 때
- History 재설계 C2–C6 증분 작업에서 동작 보존 증명이 필요할 때

## 주요 파일
- `historyShared.golden.test.ts` — 공개 유틸 함수 전반의 골든 스냅샷 테스트 (C1 패리티)

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]]
- [[ERP/frontend/app/mes/_components/_history_sections/transactionTaxonomy.ts]]
- [[ERP/frontend/app/mes/_components/_history_sections/historyQuery.ts]]
- [[ERP/frontend/app/mes/_components/_history_sections/historyTheme.ts]]
- [[ERP/frontend/app/mes/_components/_history_sections/historyFormat.ts]]
