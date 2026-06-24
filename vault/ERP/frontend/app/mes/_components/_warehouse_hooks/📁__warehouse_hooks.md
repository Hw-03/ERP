# 📁 _warehouse_hooks

## 이 폴더는 뭐예요?

창고 탭의 데이터 페칭·스크롤 상태 훅입니다.

## 주요 파일

- `useWarehouseData.ts` — 창고 탭 메인 데이터 (내 요청·부서 큐·인수인계서) 페칭
- `useWarehouseScroll.ts` — 창고 탭 스크롤 복원 상태

## 언제 여기를 보나요?

- 창고 탭 데이터 로딩이 이상할 때
- 창고 탭 UI 상태 공유가 필요할 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/📁__warehouse_sections]] — 이 훅을 소비하는 UI
- [[ERP/frontend/lib/queries/useStockRequestsQuery.ts]] — 결재 요청 React Query 훅

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/stock_requests.py]] — 결재 요청 API
