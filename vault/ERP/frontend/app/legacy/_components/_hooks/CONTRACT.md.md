---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/CONTRACT.md"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# CONTRACT.md — CONTRACT.md 설명

## 이 파일은 무엇을 책임지나

`CONTRACT.md`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Hook Contract — frontend/app/legacy/\_components/\_hooks`
- `1. Read hook (단일 fetcher)`
- `2. List hook (페이지 / 검색 / 필터)`
- `3. Mutation hook`
- `4. POST/PUT/PATCH 응답 헬퍼`
- `5. Race / 정합성 패턴 정리`
- `6. Form 상태`
- `7. 향후 hook 추가 시 체크리스트`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/📁__hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```md
# Hook Contract — frontend/app/legacy/\_components/\_hooks

이 폴더와 `_admin_hooks/`, `mobile/hooks/` 의 hook 들은 외부 라이브러리(SWR / React Query) 미도입 정책 하에서 일관된 모양을 갖도록 약속한다.

## 1. Read hook (단일 fetcher)

표준 모양: `useResource<T>(fetcher, deps)` → `{ data, loading, error, reload }`

- `data: T | undefined` — 성공 시 결과, 초기값 `undefined` (또는 `options.initial`)
- `loading: boolean` — 첫 fetch / reload 중 `true`
- `error: string | null` — 한국어 사용자 메시지
- `reload: () => Promise<void>` — 강제 재조회 (예: 사용자가 "다시 시도" 클릭)

신규 read hook 은 가급적 `useResource` 를 직접 쓰거나 위 4개 키를 그대로 노출한다.

## 2. List hook (페이지 / 검색 / 필터)

표준 모양: `useItems(filters)` → `{ items, loading, error, hasMore, loadMore, refetch }`

- 검색·필터·페이지 같이 **빈번히 변경되는 deps** 를 갖는 list hook 은 `AbortController` 를 사용한다.
  - 직전 요청을 `ctrl.abort()` 로 취소하고 마지막 결과만 반영
  - `.catch` 에서 `err.name === "AbortError"` 또는 `signal.aborted` 인 경우 무시
  - `.finally` 에서 `if (!ctrl.signal.aborted) setLoading(false)` 가드
  - `useEffect` cleanup 에서 `ctrl.abort()`
- 변경이 드문 read 는 deps 기반 reload 로 충분 (예: `useResource`).

## 3. Mutation hook

표준 모양: `{ run, busy, error }` 또는 `(payload) => Promise<T>` 형태의 함수 노출.

- **기본은 pessimistic** — `await api.x(...)` 성공 후에만 `setState` 갱신.
  - 실패 시 UI 가 잘못된 상태로 보이지 않음.
  - 코드 단순.
- **진정한 optimistic 이 필요한 경우** — 다음 패턴:
  ```ts
  const prev = state;
  setState(applyOptimistic(prev, payload));
  try {
    const created = await api.x(payload);
    setState((cur) => mergeServerResult(cur, created));
  } catch (e) {
    setState(prev); // 롤백
    onError(e);
  }
  ```
- 현재 코드베이스는 거의 모든 mutation 이 pessimistic. optimistic 으로 바꿀 때는 위 패턴 + 의도 주석.

## 4. POST/PUT/PATCH 응답 헬퍼

`lib/api.ts` 의 `postJson<T>` / `putJson<T>` / `patchJson<T>` 헬퍼 사용.

- inline `res.json() as Promise<T>` 캐스팅 금지 — 헬퍼로 통일.
- 에러 처리는 `parseError(res)` 로 단일 진입점.

## 5. Race / 정합성 패턴 정리
```
