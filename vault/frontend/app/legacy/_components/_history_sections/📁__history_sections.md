---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/
tags: [vault, index, folder-marker]
aliases:
  - "_history_sections"
  - "_history_sections.md"
---

# 📁 _history_sections

> [!summary] 역할
> 거래 이력 조회 화면을 구성하는 UI 컴포넌트와 도메인 유틸 모음.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/_history_sections/` 의 vault 미러.

## 어떤 파일들이 있나

**UI 컴포넌트**
- [[erp/frontend/app/legacy/_components/_history_sections/HistoryCalendarStrip.tsx.md|HistoryCalendarStrip.tsx]] — 날짜 선택 달력 스트립
- [[erp/frontend/app/legacy/_components/_history_sections/HistoryFilterBar.tsx.md|HistoryFilterBar.tsx]] — 상단 필터 바
- [[erp/frontend/app/legacy/_components/_history_sections/HistoryFilterPanel.tsx.md|HistoryFilterPanel.tsx]] — 슬라이드 필터 패널
- [[erp/frontend/app/legacy/_components/_history_sections/HistoryLogRow.tsx.md|HistoryLogRow.tsx]] — 이력 목록 개별 행
- [[erp/frontend/app/legacy/_components/_history_sections/HistoryDetailEditHistory.tsx.md|HistoryDetailEditHistory.tsx]] — 상세 패널 수정 이력 탭
- [[erp/frontend/app/legacy/_components/_history_sections/HistoryDetailRecentLogs.tsx.md|HistoryDetailRecentLogs.tsx]] — 상세 패널 최근 거래 탭
- [[erp/frontend/app/legacy/_components/_history_sections/BomBatchDetail.tsx.md|BomBatchDetail.tsx]] — BOM 배치 상세 (배치 해석 포함)
- [[erp/frontend/app/legacy/_components/_history_sections/TransactionEditUnifiedModal.tsx.md|TransactionEditUnifiedModal.tsx]] — 거래 수정 통합 모달
- `HistoryTable.tsx`, `HistoryStatsBar.tsx`, `HistoryDetailPanel.tsx`, `HistoryBatchDetailPanel.tsx`, `DesktopHistoryRightPanel.tsx`

**도메인 유틸 (non-React)**
- [[erp/frontend/app/legacy/_components/_history_sections/historyFormat.ts.md|historyFormat.ts]] — 날짜·수량·단위 포맷터
- [[erp/frontend/app/legacy/_components/_history_sections/historyQuery.ts.md|historyQuery.ts]] — 필터 버킷 정의 (OPERATION_OPTIONS, DATE_OPTIONS, 3단계 scope)
- [[erp/frontend/app/legacy/_components/_history_sections/historyTheme.ts.md|historyTheme.ts]] — 거래 유형별 tint 색상 함수
- [[erp/frontend/app/legacy/_components/_history_sections/transactionTaxonomy.ts.md|transactionTaxonomy.ts]] — `TransactionType` scope 분류 (HistoryScope, isWarehouseInvolvedType 등)
- `historyConstants.ts`, `historyBatchInterpreter.ts`, `historyTableHelpers.tsx`

## 도메인 컨텍스트

이력 조회 화면(`DesktopHistoryView`) 전용 섹션.  
`historyQuery.ts` 에서 정의한 11개 `OPERATION_OPTIONS`와 3단계 scope (`ALL` / `WAREHOUSE_INVOLVED` / `DEPT_INTERNAL`) 가 필터링의 기준이다.  
`transactionTaxonomy.ts` 는 `historyShared.ts` 에서 분리된 파일 — 동일 폴더 내에서 상호 참조하므로 import 경로 주의.

## ⚠️ 위험 포인트

- `historyBatchInterpreter.ts` 의 `_TX_OPERATION` 과 `historyQuery.ts` 의 `OPERATION_OPTIONS` 는 같은 `transaction_type` 값을 각자 독립적으로 보유. 두 파일 모두 수정해야 일관성 유지.
- `transactionTaxonomy.ts` 와 `historyTheme.ts` 를 변경하면 이력 행 색상·scope 분류 전체에 영향.

## 관련 가이드

- [[erp/_vault/guides/history-flow]]

## 자식 폴더

- [[erp/frontend/app/legacy/_components/_history_sections/__tests__/📁___tests__|__tests__/]]
