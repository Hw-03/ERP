---
type: file-explanation
source_path: "_attic/docs/research/frontend-exhaustive-deps-audit.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# frontend-exhaustive-deps-audit.md — frontend-exhaustive-deps-audit.md 설명

## 이 파일은 무엇을 책임지나

`frontend-exhaustive-deps-audit.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `exhaustive-deps disable 분류 보고서 — 2026-05-04`
- `1. 결론`
- `2. 위치별 분류`
- `3. 분류 카테고리`
- `Cat-A: mount-only / 의도적 1회 (유지)`
- `Cat-B: useCallback 으로 정상화 가능 (낮은 위험)`
- `Cat-C: 커스텀 훅 분리 필요 (중간 위험)`
- `Cat-D: 제네릭 deps (유지 정당)`
- `4. 본 라운드 처리`
- `5. 정상화 패턴 예시 (Round-4 진입 시 참고)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
```
