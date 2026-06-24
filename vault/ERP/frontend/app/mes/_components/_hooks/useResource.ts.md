# useResource.ts

## 이 파일은 뭐예요?
SWR/React Query 없이 단일 비동기 fetcher의 결과를 `data/loading/error/reload` 모양으로 통일하는 범용 훅입니다. deps가 바뀌면 재조회하고, AbortController로 경쟁 응답(race condition)을 자동 처리합니다.

## 언제 보나요?
- 새 API 연동 시 로딩/에러/재시도 패턴을 만들어야 할 때
- "다시 시도" 버튼이 있는 패널/카드 컴포넌트를 만들 때
- deps 변경 시 이전 요청이 캔슬되지 않아 stale 데이터가 렌더되는 문제를 볼 때

## 중요한 내용
- `useResource<T>(fetcher, deps, options?)` 시그니처
- 반환값 `Resource<T>`: `{ data, loading, error, reload }`
- `fetcher`는 `(signal?: AbortSignal) => Promise<T>` — signal 받으면 race 자동 처리, 안 받아도 호환
- `reload()`: 강제 재조회, 에러 후 "다시 시도" 버튼 용도
- `options.initial`: 초기 data 값 설정 가능
- `fetcherRef` 패턴으로 deps 외 최신 fetcher 참조 유지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/📁__components]] — useResource를 사용하는 재고·내역 패널들
