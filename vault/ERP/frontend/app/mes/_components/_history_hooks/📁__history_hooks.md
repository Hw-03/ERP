# 📁 _history_hooks

## 이 폴더는 뭐예요?

거래 내역 탭(`DesktopHistoryView`)의 데이터 로직 훅이 들어 있습니다.

## 주요 파일

- `useHistoryDerivations.ts` — 거래 내역 데이터에서 파생 값(집계·레이블 등)을 계산하는 훅

## 언제 여기를 보나요?

- 거래 내역 데이터가 잘못 집계되거나 표시될 때
- 내역 필터·정렬 로직을 수정할 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/📁__history_sections.md]] — UI 섹션
- [[ERP/frontend/lib/queries/useTransactionsQuery.ts.md]] — 거래 내역 React Query 훅

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/inventory/transactions.py.md]] — 거래 내역 API
