# MobileHistoryList.tsx

## 이 파일은 뭐예요?
입출고 내역 모바일 화면에서 거래 로그를 카드 형태로 보여주는 리스트 컴포넌트입니다. 단건(solo)과 묶음(batch/op_batch) 두 가지 카드 유형을 렌더링하며, 데스크톱 6열 테이블 대신 393px 화면에 맞는 터치 친화적 레이아웃을 제공합니다.

## 언제 보나요?
- 모바일에서 입출고 내역 탭을 열었을 때 로그 목록이 표시되는 시점
- 필터 조건을 바꿔 `filteredLogs`가 갱신될 때마다 카드 리스트가 다시 그려질 때
- 하단 "더 보기" 버튼을 눌러 추가 로그를 불러올 때

## 중요한 내용
- **`MobileHistoryList`** — 유일한 named export. props:
  - `loading` / `filteredLogs` / `selectedKey` — 로딩 상태·필터된 로그 배열·현재 선택 키
  - `onSelectLog(log)` — 단건 탭 시 부모가 BottomSheet 상세를 열기 위해 호출
  - `onSelectBatch(batchId, logs)` — 묶음 탭 시 호출
  - `canLoadMore` / `loadingMore` / `onLoadMore` — 페이지네이션 더 보기 제어
- **`buildGroups(filteredLogs)`** — `historyTableHelpers`의 순수함수를 그대로 재사용해 solo/batch/op_batch 그룹으로 묶음
- 선택 상태는 `selectedKey`(`log:<id>` 또는 `batch:<key>` 형식)로 파란 테두리 하이라이트
- `rowTint` / `transactionColor` / `LEGACY_COLORS` 로 거래 유형별 배경·컬러 적용
- `LoadingSkeleton` (variant="list", rows=8) — 로딩 중 스켈레톤, `EmptyState` (variant="no-data") — 결과 없음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — `buildGroups`, `MovementSummaryCell` 제공
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `getHistoryActor`, `getHistoryDisplayLabel`, `getSingleLogMovement`
- [[ERP/frontend/app/mes/_components/_history_sections/historyFormat.ts]] — `formatHistoryDate`
- [[ERP/frontend/app/mes/_components/_history_sections/historyTheme.ts]] — `rowTint`
- [[ERP/frontend/lib/mes-status.ts]] — `transactionColor`
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS`
