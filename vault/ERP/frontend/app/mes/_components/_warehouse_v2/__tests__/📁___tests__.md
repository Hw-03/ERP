# 📁 __tests__

## 이 폴더는 뭐예요?
`_warehouse_v2` 컴포넌트 폴더의 단위/골든 테스트 모음. 입출고 흐름 순수 함수, BOM 비례 재계산, 품목 정렬, URL 동기화 hook 등 warehouse_v2의 핵심 로직을 vitest로 격리 검증한다.

## 언제 여기를 보나요?
- `ioWorkType.ts`, `useIoWorkState.ts`, `bomSync.ts` 등 warehouse_v2 로직 수정 전후 회귀 확인 시
- 골든 테스트 기준선(현재 출력 고정)이 무엇인지 파악할 때
- 새 테스트를 추가하거나 기존 테스트가 실패할 때

## 주요 파일
- `warehouseFlow.golden.test.ts` — 입출고 전체 흐름(ioWorkType + useIoWorkState + bomSync) 패리티 골든
- `quickChoiceToIntent.test.ts` — 빠른 선택 버튼 → 작업 의도 변환 검증
- `itemPickerSort.golden.test.ts` — 품목 picker 4단계 정렬 골든
- `pullFromWarehouse.test.ts` — 창고에서 가져오기 부족 재고 수집 로직
- `useIoPreselect.test.tsx` — preselectedItem 자동 적용 hook 분기 검증
- `useIoUrlSync.test.tsx` — URL ?step=N 양방향 동기화 hook 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 이 테스트들이 검증하는 로직의 원 출처 뷰
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — 입출고 workType/subType 순수 함수 모음
- [[ERP/frontend/app/mes/_components/_warehouse_v2/bomSync.ts]] — BOM 비례 재계산 추출 함수
