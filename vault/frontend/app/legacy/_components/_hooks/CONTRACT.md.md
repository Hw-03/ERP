---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_hooks/CONTRACT.md
status: active
updated: 2026-04-27
source_sha: 9a7776a8263a
tags:
  - erp
  - frontend
  - source-file
  - md
---

# CONTRACT.md

> [!summary] 역할
> 원본 프로젝트의 `CONTRACT.md` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_hooks/CONTRACT.md`
- Layer: `frontend`
- Kind: `source-file`
- Size: `3698` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_hooks/_hooks|frontend/app/legacy/_components/_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````markdown
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

| 상황 | 패턴 |
|---|---|
| 검색창 빠른 타이핑 | AbortController (`useItems`, `useTransactions`) |
| 단일 fetcher + deps 변경 | `useResource(fetcher, deps)` — fetcher 가 `signal` 받으면 자동 abort 처리 (5.5-F) |
| 변하지 않는 reference 데이터 | `useResource(fn, [])` |
| 외부 트리거(저장 후 갱신) | 부모가 `refetch()` 호출 / Context 의 `refresh*` 콜백 |
| 단일 mutation | `await api.x()` → `setState` (pessimistic) |
| 즉시 UI 반응이 중요 | optimistic + 롤백 (현재는 거의 없음) |

## 6. Form 상태

- form 라이브러리(react-hook-form / formik) 미도입.
- 단순 form 은 `useState` 다중 호출로 충분.
- 5개 이상 필드 + 단계 진행이 있는 wizard 는 Context dispatcher 패턴 사용 (예: `_warehouse_steps/`, `_dept_steps/`).

## 7. 향후 hook 추가 시 체크리스트

- [ ] 위 1~3 형태 중 하나에 정렬되는가?
- [ ] race 가능성이 있으면 AbortController 적용했는가?
- [ ] mutation 은 pessimistic 인지 optimistic 인지 의도가 명확한가?
- [ ] 에러 메시지는 한국어 사용자 메시지인가?
- [ ] `data, loading, error` 키가 일관되는가?
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
