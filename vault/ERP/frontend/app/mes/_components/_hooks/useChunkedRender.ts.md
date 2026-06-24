# useChunkedRender.ts

## 이 파일은 뭐예요?
큰 배열을 청크 단위로 나눠 점진적으로 렌더링하는 훅입니다. 리스트 끝에 `sentinelRef`를 붙이면 `IntersectionObserver`가 스크롤 진입 시마다 표시 개수를 `chunkSize`씩 늘립니다.

## 언제 보나요?
- 1000개 이상 품목 목록이 한꺼번에 렌더돼 성능 문제가 생길 때
- "더 불러오기" 없이 무한 스크롤처럼 동작시키고 싶을 때
- 필터/정렬 변경 후 목록이 첫 청크로 리셋되는 흐름을 파악할 때

## 중요한 내용
- `useChunkedRender<T>(items, chunkSize = 50)` 시그니처
- 반환값: `{ visible, sentinelRef, hasMore, total, shown }`
- `sentinelRef`: `HTMLElement` ref — 리스트 맨 끝 더미 요소에 연결
- `rootMargin: "200px"`: sentinel이 뷰포트 200px 앞에 들어오면 미리 로드
- `items` 참조가 바뀌면 count를 `chunkSize`로 리셋 (외부 변이 배열은 잡지 못함)
- 외부 라이브러리 의존성 없음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/📁__components]] — 이 훅을 사용하는 재고/내역 뷰 컴포넌트들
