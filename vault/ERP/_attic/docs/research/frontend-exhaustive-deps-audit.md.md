---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/frontend-exhaustive-deps-audit.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# frontend-exhaustive-deps-audit.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/frontend-exhaustive-deps-audit.md]]

## 원본 첫 줄 (또는 메타)

```
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
```
