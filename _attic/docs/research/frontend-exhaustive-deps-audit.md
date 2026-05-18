# exhaustive-deps disable 분류 보고서 — 2026-05-04

> **작업 ID:** R3-6
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 분류만. 코드 변경 0.

---

## 1. 결론

`react-hooks/exhaustive-deps` disable 총 **18곳**. 대부분은 의도적이고 stale closure 위험은 낮음. 하지만 **9곳은 useCallback / 커스텀 훅 분리로 정상화 가능**. Round-3 에선 분류만, 정상화는 Round-4 부터.

---

## 2. 위치별 분류

| # | 파일 | 분류 | 권장 조치 |
|---|---|---|---|
| 1 | `app/legacy/page.tsx` | URL searchParams 변경 시 1회 동기화 | **유지 + 사유 주석 강화** |
| 2 | `app/queue/page.tsx` | `load` 함수 재생성 회피 | useCallback 으로 정상화 |
| 3 | `app/legacy/_components/DesktopAdminView.tsx` (×2) | 부트스트랩 fetch — `globalSearch` 만 트리거 | **useAdminBootstrap 훅 분리** |
| 4 | `app/legacy/_components/DesktopInventoryView.tsx` | 동일 — `loadItems` 재생성 | useCallback |
| 5 | `app/legacy/_components/DesktopWarehouseView.tsx` (×3) | autoSave 타이머 / draft fetch / 결과 피드백 | **useWarehouseDraft 훅 분리 + lastResult 정상화** |
| 6 | `app/legacy/_components/_hooks/useResource.ts` | `deps` spread — 의도적 (제네릭 deps) | **유지** (주석 명확) |
| 7 | `app/legacy/_components/DesktopLegacyShell.tsx` (×2) | searchParams sync + memo deps | useCallback / 정상화 가능 |
| 8 | `app/alerts/page.tsx` | `load` 함수 재생성 | useCallback |
| 9 | `app/legacy/_components/login/LoginIntro.tsx` (×2) | mount-only timer / cleanup | **유지** (mount-only 의도) |
| 10 | `app/legacy/_components/_warehouse_hooks/useWarehouseCompletionFeedback.ts` | `lastResult` 1회 처리 | useRef 기반 정상화 |
| 11 | `app/legacy/_components/mobile/hooks/useItems.ts` | filterKey 기반 useCallback | **이미 useCallback 사용 중 — 정상화 가능** |
| 12 | `app/legacy/_components/mobile/hooks/useEmployees.ts` | 동일 | 동일 |

---

## 3. 분류 카테고리

### Cat-A: mount-only / 의도적 1회 (유지)

- LoginIntro 의 timer
- legacy/page.tsx 의 searchParams 동기화
- DesktopLegacyShell 의 searchParams 동기화

→ 사유 주석 보강만. 5곳.

### Cat-B: useCallback 으로 정상화 가능 (낮은 위험)

- queue/page.tsx 의 `load`
- alerts/page.tsx 의 `load`
- DesktopInventoryView 의 `loadItems`
- mobile/hooks/useItems / useEmployees

→ Round-4 PR-1: 5곳 일괄 정상화.

### Cat-C: 커스텀 훅 분리 필요 (중간 위험)

- DesktopAdminView 의 부트스트랩 fetch (×2)
- DesktopWarehouseView 의 autoSave / draft / 피드백 (×3)
- DesktopLegacyShell 의 memo
- useWarehouseCompletionFeedback

→ Round-4 PR-2: `useAdminBootstrap`, `useWarehouseDraft` 훅 신설 후 분리. 8곳.

### Cat-D: 제네릭 deps (유지 정당)

- `_hooks/useResource.ts`

→ 1곳. 주석 그대로.

---

## 4. 본 라운드 처리

각 disable 의 분류만 본 보고서에 기록. 실제 정상화 작업은:

- **Round-4 PR-1** (Cat-B 5곳, useCallback) — 위험 A
- **Round-4 PR-2** (Cat-C 8곳, 커스텀 훅) — 위험 C, 거대 컴포넌트 분해와 함께

---

## 5. 정상화 패턴 예시 (Round-4 진입 시 참고)

### Cat-B 패턴

```tsx
// before
const load = async () => { ... };
useEffect(() => {
  void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [status]);

// after
const load = useCallback(async () => { ... }, [/* 실제 의존 */]);
useEffect(() => {
  void load();
}, [load]);
```

### Cat-C 패턴 (커스텀 훅)

```tsx
// before — DesktopAdminView 안 부트스트랩
useEffect(() => {
  if (!unlocked) return;
  void Promise.all([api.getItems(), api.getEmployees(), ...]).then(...);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [unlocked, globalSearch]);

// after
const adminData = useAdminBootstrap({ unlocked, globalSearch, onError });
const { items, employees, ... } = adminData;
```

useAdminBootstrap 내부에서 deps 정상화 + 캐싱 + abort.

---

## 6. 진행도 메트릭

| 측정 | 명령 | 현재 | 목표 |
|---|---|---|---|
| disable 총 갯수 | `rg -c "exhaustive-deps" frontend/app frontend/lib \| awk -F: '{s+=$2}END{print s}'` | **18** | ≤ 5 |
| Cat-A (정당 유지) | 본 보고서 | 5 | 그대로 |
| Cat-B (useCallback 정상화) | 본 보고서 | 5 | 0 |
| Cat-C (훅 분리) | 본 보고서 | 8 | 0 |
| Cat-D (제네릭) | 본 보고서 | 1 | 그대로 |

→ 정상화 후 잔여 5건 (모두 Cat-A + Cat-D, 정당 사유).

---

## 7. 관련 작업

- `frontend-100-score-refactor-plan.md` — Round-3 진단
- `2026-05-04-next-split-roadmap.md` — Round-4 ADMIN-HOOK-1 (`useAdminBootstrap`)
- 본 라운드는 분류만, Round-4 PR-1 / PR-2 가 실제 정상화
