# 📁 __tests__

## 이 폴더는 뭐예요?
모바일 훅(`hooks/`) 단위 테스트 모음. `useEmployees`, `useItems`, `useTransactions` 세 훅을 각각 독립 테스트 파일로 검증하며, `api` 레이어를 `vi.mock`으로 가로채어 네트워크 없이 실행된다.

## 언제 여기를 보나요?
- 모바일 데이터 훅 수정 후 회귀를 확인할 때
- AbortController 경쟁 조건, 에러 처리, 페이징(`hasMore`) 계약을 파악할 때

## 주요 파일
- `useEmployees.test.tsx` — `useEmployees` 훅: `activeOnly`, `department` 인자 전달 및 에러 검증
- `useItems.test.tsx` — `useItems` 훅: AbortError 무시·경쟁 조건·일반 에러 검증
- `useTransactions.test.tsx` — `useTransactions` 훅: `hasMore` 판정(페이지 크기 100) 및 에러 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/hooks/📁_hooks]] — 테스트 대상 훅 폴더
