# 📁 _history_sections

## 이 폴더는 뭐예요?

거래 내역 탭의 UI 섹션 모음입니다. 거래 로그를 보여주고, 필터·내보내기·수정 기능을 제공합니다.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `HistoryTable.tsx` | 거래 내역 메인 테이블 |
| `HistoryLogRow.tsx` | 거래 한 줄 표시 |
| `HistoryFilterBar.tsx` | 필터 바 (날짜·부서·거래유형) |
| `HistoryFilterPanel.tsx` | 상세 필터 패널 |
| `HistoryDetailPanel.tsx` | 거래 상세 슬라이드 패널 |
| `HistoryDetailEditHistory.tsx` | 수정 이력 표시 |
| `HistoryCalendarPanel.tsx` | 캘린더 뷰 |
| `HistoryStatsBar.tsx` | 통계 요약 바 |
| `BomBatchDetail.tsx` | BOM 배치 상세 정보 |
| `ReworkBatchDetail.tsx` | 재작업 배치 상세 |
| `historyBatchInterpreter.ts` | 배치 유형 해석 로직 (큰 파일, 분리 X) |
| `transactionTaxonomy.ts` | 거래 유형 분류 체계 |

## 언제 여기를 보나요?

- 내역 화면 UI를 수정할 때
- 거래 유형 레이블·분류가 틀렸을 때
- 수정 이력 표시 방식을 바꿀 때

## 건드릴 때 조심할 점

- `historyBatchInterpreter.ts` 는 의도적으로 큰 단일 파일로 유지 중. 분리 요청 없으면 쪼개지 말 것

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/inventory/transactions.py.md]] — 거래 내역 API
- [[ERP/frontend/app/mes/_components/_history_hooks/📁__history_hooks.md]] — 데이터 훅

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/models/transaction.py.md]] — TransactionLog 모델
