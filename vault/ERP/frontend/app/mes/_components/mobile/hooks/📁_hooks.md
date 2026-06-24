# 📁 hooks

## 이 폴더는 뭐예요?
모바일 화면 전용 데이터 fetch 커스텀 훅 모음입니다. API 호출, 로딩/에러 상태 관리, 페이지네이션(무한 스크롤), AbortController 기반 race condition 방지 등을 캡슐화하여 모바일 컴포넌트가 UI 로직에만 집중할 수 있게 합니다.

## 언제 여기를 보나요?
- 모바일 화면에서 직원·품목·거래내역 목록을 어떻게 가져오는지 알고 싶을 때
- 무한 스크롤 또는 필터 변경 시 이전 요청 취소 로직을 확인할 때
- 모바일 HistoryScreen의 보조 데이터(필터 옵션, 캘린더 로그)가 어디서 오는지 추적할 때

## 주요 파일
- `useEmployees.ts` — 부서·활성 여부 조건으로 직원 목록 fetch
- `useItems.ts` — 검색어·부서 필터 + 무한 스크롤로 품목 목록 fetch (AbortController)
- `useTransactions.ts` — 거래 내역 페이지네이션 + `fetchMonthLogs` 유틸 함수
- `useMobileHistoryAux.ts` — HistoryScreen 보조 데이터(품목·모델·캘린더 로그) 통합 훅

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — 모든 훅이 사용하는 공통 API 클라이언트
- [[ERP/frontend/lib/queries/useModelsQuery.ts]] — 제품 모델 React Query (useMobileHistoryAux에서 사용)
