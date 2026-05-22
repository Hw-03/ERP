---
type: code-note
project: DEXCOWIN MES
layer: frontend
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/DraftCartPanel.tsx
status: active
updated: 2026-05-21
tags:
  - layer/frontend
  - topic/warehouse
---

# DraftCartPanel.tsx

> [!summary] 역할
> **창고 화면 "작업 중" 탭 패널.** 현재 작업자의 저장된 초안(draft) 목록을 불러와 목록으로 표시하고, 이어하기·삭제 기능을 제공한다. 레거시 `StockRequest` 초안과 입출고 2.0 `IoBatch` 초안 두 종류를 모두 처리한다.

---

## 1. 위치

```
erp/frontend/app/legacy/_components/_warehouse_sections/DraftCartPanel.tsx
```

**부모**: `DesktopWarehouseView.tsx` (cart 탭 활성 시 표시)

---

## 2. 역할 한 줄 요약

"저장했다가 나중에 이어하기" 기능의 목록 패널. 두 종류의 초안(레거시/2.0)을 병렬로 fetch해서 카드 목록으로 표시한다.

---

## 3. Props

| prop | 타입 | 설명 |
|---|---|---|
| `employeeId` | `string \| null` | 현재 작업자 ID |
| `refreshNonce` | `number` | 외부에서 증가시키면 목록 재조회 |
| `onContinue` | `(draft: StockRequest) => void` | 레거시 초안 이어하기 |
| `onContinueIo` | `(draft: IoBatch) => void` | 2.0 초안 이어하기 |
| `onChanged` | `() => void` | 삭제 완료 후 부모에 알림 (배지 수 갱신) |
| `onCountChange` | `(n: number) => void` | 초안 총 개수 → 부모 배지 업데이트 |

---

## 4. 데이터 흐름

```mermaid
flowchart TD
    A[reload 호출\n(employeeId or refreshNonce 변경)] --> B["Promise.all\n[listStockRequestDrafts, listDrafts]"]
    B --> C[drafts: StockRequest[]\nioDrafts: IoBatch[]]
    C --> D["onCountChange(legacyRows.length + ioRows.length)"]
    C --> E[렌더링]
    E --> F["IoDraftWorkCard x N\n(2.0 초안)"]
    E --> G["DraftCartItemRow x M\n(레거시 초안)"]
```

---

## 5. 삭제 플로우

```typescript
type DeleteTarget =
  | { kind: "stock"; draft: StockRequest }
  | { kind: "io"; draft: IoBatch }
  | null;
```

1. 삭제 버튼 클릭 → `setDeleteTarget(...)` → ConfirmModal 표시
2. 확인 클릭 → `handleDeleteConfirm()` 호출
3. 종류에 따라 `api.deleteStockRequestDraft` 또는 `api.deleteDraft` 호출
4. 완료 후 `reload()` + `onChanged()`

---

## 6. 코드 발췌 — 병렬 fetch

```tsx
const reload = useCallback(async () => {
  if (!employeeId) {
    setDrafts([]);
    setIoDrafts([]);
    onCountChange?.(0);
    return;
  }
  setLoading(true);
  try {
    const [legacyRows, ioRows] = await Promise.all([
      api.listStockRequestDrafts(employeeId),
      api.listDrafts(employeeId),
    ]);
    setDrafts(legacyRows);
    setIoDrafts(ioRows);
    onCountChange?.(legacyRows.length + ioRows.length);
  } catch (err) {
    setLoadError(err instanceof Error ? err.message : "작업 중 목록을 불러오지 못했습니다.");
  } finally {
    setLoading(false);
  }
}, [employeeId, onCountChange]);
```

---

## 7. 렌더링 조건

| 상태 | 표시 내용 |
|---|---|
| `employeeId === null` | "작업자를 선택하세요" EmptyState |
| `loading` | LoadingSkeleton (list, 2행) |
| `loadError` | LoadFailureCard + 재시도 버튼 |
| `empty` | "작업 중인 요청이 없습니다." EmptyState |
| 정상 | IoDraftWorkCard + DraftCartItemRow 목록 |

---

## 8. 두 종류의 초안 카드

| 컴포넌트 | 초안 종류 | 표시 내용 |
|---|---|---|
| `IoDraftWorkCard` | `IoBatch` (입출고 2.0) | 작업 유형·부서·묶음 수·저장 시각 |
| `DraftCartItemRow` | `StockRequest` (레거시) | 요청 품목·수량·저장 시각 |

---

## 9. 연결 관계

- **부모**: `erp/frontend/app/legacy/_components/DesktopWarehouseView.tsx`
- **자식**: `IoDraftWorkCard`, `DraftCartItemRow`
- **API**: `api.listDrafts`, `api.deleteDraft`, `api.listStockRequestDrafts`, `api.deleteStockRequestDraft`

---

## 10. 참고 맥락

> [!note] 참고
> 입출고 마법사에서 작업 중에 자동 저장된 초안들이 여기 모인다. 탭 배지의 숫자가 이 패널의 초안 개수다.
>
> 레거시(`StockRequest`)와 2.0(`IoBatch`) 두 종류가 공존하는 이유는 시스템 전환 과정에서 이전 방식의 초안이 아직 남아있을 수 있기 때문이다. 두 종류를 병렬로 불러와 한 화면에 보여준다.
