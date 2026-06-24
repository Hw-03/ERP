# useResource.test.tsx

## 이 파일은 뭐예요?
`useResource` 훅의 비동기 데이터 패칭 상태(loading/data/error)와 reload() 재실행을 검증하는 Vitest 테스트 파일. 성공·실패·재호출 시나리오를 vi.fn()으로 모킹해 확인한다.

## 언제 보나요?
- `useResource` 훅 수정 후 loading 초기값, error 처리, reload 동작의 회귀 여부를 확인할 때
- 비동기 fetcher 패턴을 새로 도입하거나 변경할 때

## 중요한 내용
- 초기: loading=true, data=undefined, error=null
- 성공: data에 응답 값 셋, loading=false, error=null
- 실패: error에 메시지 셋, data=undefined, loading=false
- reload() 호출 시 fetcher가 재실행되고 data가 최신 값으로 교체됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useResource.ts]] — 테스트 대상 훅 구현
