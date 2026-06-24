# 📁 __tests__

## 이 폴더는 뭐예요?
`_hooks/` 안의 커스텀 훅들을 단위 테스트하는 Vitest 테스트 파일 모음. 각 훅의 상태 변화·함수 참조 안정성·비동기 동작을 `renderHook`으로 검증한다.

## 언제 여기를 보나요?
- `_hooks/` 내 훅을 수정했을 때 회귀 여부를 확인해야 할 때
- 훅의 정확한 동작 계약(초기값, 에러 처리, 리셋 조건 등)을 문서 없이 파악하고 싶을 때

## 주요 파일
- `useChunkedRender.test.tsx` — 청크 렌더링 크기·리셋·hasMore 검증
- `useResource.test.tsx` — 비동기 fetcher loading/data/error·reload 검증
- `useToggleSet.test.tsx` — 다중 선택 toggle·clear·onChange 콜백 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/📁__hooks]] — 테스트 대상 훅들이 모여 있는 상위 폴더
