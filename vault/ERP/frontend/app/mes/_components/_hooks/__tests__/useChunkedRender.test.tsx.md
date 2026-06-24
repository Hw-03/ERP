# useChunkedRender.test.tsx

## 이 파일은 뭐예요?
`useChunkedRender` 훅의 청크 렌더링 동작을 검증하는 Vitest 테스트 파일. 기본 chunkSize(50), 커스텀 chunkSize, items 변경 시 리셋, hasMore 플래그 등 4가지 케이스를 확인한다.

## 언제 보나요?
- `useChunkedRender` 훅 수정 후 동작 회귀 여부를 확인할 때
- 청크 크기나 리셋 로직에 버그가 의심될 때

## 중요한 내용
- 기본 chunkSize=50: items 200개 → visible 50개, hasMore=true 검증
- items 길이 ≤ chunkSize 이면 전부 visible, hasMore=false
- items 레퍼런스 변경 시 shown이 첫 chunk로 리셋되고 visible[0]도 새 배열 첫 원소로 교체됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useChunkedRender.ts]] — 테스트 대상 훅 구현
