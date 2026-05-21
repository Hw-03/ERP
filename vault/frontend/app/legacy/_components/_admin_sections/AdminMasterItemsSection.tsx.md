---
tags:
  - layer/frontend
  - topic/admin
  - audience/junior
aliases:
  - AdminMasterItemsSection
created: 2026-05-21
---

# AdminMasterItemsSection.tsx

> [!info] 한 줄 요약
> 품목 마스터 CRUD 화면. 좌측 품목 목록 + 우측 4탭 상세(기본정보·재고·BOM·이력). `[[시나리오_품목등록]]` 흐름의 프론트엔드 구현체.

## 1. 파일 위치

```
erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsSection.tsx
```

## 2. 책임 (단일 목적)

- 품목 목록 검색·선택 (AdminListPanel)
- 품목 추가 폼 (AddItemForm) / 편집 폼 (EditItemForm) 전환
- 4개 탭 상세: 기본 정보 / 재고 정보 / BOM·사용처 / 변경 이력
- KPI 바: 전체·정상·부족 카운트 (안전재고 기준)

## 3. Props / 인터페이스

```ts
interface Props {
  allBomRows: BOMDetailEntry[];  // 전체 BOM flat list — BOM 탭·사용처 탭에서 client-side 필터링
}
```

내부 상태 대부분은 `useAdminMasterItemsContext()` 에서 가져옴.

## 4. Context 의존

`AdminMasterItemsContext` 가 제공하는 주요 값:

| 키 | 설명 |
|---|---|
| `visibleItems` | 검색 후 필터된 품목 배열 |
| `selectedItem` | 현재 선택된 품목 (`null` = 미선택) |
| `setSelectedItem` | 품목 선택 setter |
| `itemSearch` | 검색어 문자열 |
| `setItemSearch` | 검색어 setter |
| `addMode` | 추가 폼 활성 여부 |
| `setAddMode` | 추가 모드 toggle |

## 5. KPI 계산 로직

```ts
// erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsSection.tsx (47-55)
const stats = useMemo(() => {
  let ok = 0;
  let low = 0;
  for (const it of visibleItems) {
    if (it.min_stock != null && Number(it.quantity) < Number(it.min_stock)) low += 1;
    else ok += 1;
  }
  return { ok, low };
}, [visibleItems]);
```

> [!note] min_stock null 처리
> `min_stock` 이 `null` 이면 부족 판정 제외 → 안전재고 미설정 품목은 항상 "정상" 집계됨.

## 6. 화면 흐름 다이어그램

```mermaid
flowchart TD
    List["좌측: 품목 목록<br/>(AdminListPanel)"] -->|클릭| Select["selectedItem 갱신"]
    Select --> Tab{상세 탭}
    Tab -->|info| EditItemForm["EditItemForm<br/>(이름·코드·단위·안전재고)"]
    Tab -->|stock| StockTab["ItemStockTab<br/>(현재재고·창고보관·안전재고·상태)"]
    Tab -->|bom| BomTab["ItemBomTab<br/>(구성품 목록 + 사용처 목록)"]
    Tab -->|history| HistoryTab["ItemHistoryTab<br/>(등록일·최종수정일, 준비중)"]

    AddBtn["우상단: 품목 추가"] -->|setAddMode(true)| AddItemForm["AddItemForm"]
```

## 7. 코드 발췌 (목록 렌더)

```tsx
// erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsSection.tsx (118-157)
renderItem={(item) => {
  const isSelected = selectedItem?.item_id === item.item_id;
  const lowStock =
    item.min_stock != null && Number(item.quantity) < Number(item.min_stock);
  return (
    <button
      key={item.item_id}
      type="button"
      onClick={() => {
        setAddMode(false);
        setSelectedItem(isSelected ? null : item);
      }}
      className="flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left"
      style={{
        background: isSelected
          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
          : LEGACY_COLORS.s2,
        borderColor: isSelected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
      }}
    >
      <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black tabular-nums">
        {item.item_code ?? "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
        {item.item_name}
      </span>
      {lowStock && <StatusPill label="부족" tone="danger" showDot maxWidth={50} />}
    </button>
  );
}}
```

## 8. BOM 탭 — allBomRows 클라이언트 필터링

```ts
// erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsSection.tsx (285-292)
const composition = useMemo(
  () => allBomRows.filter((row) => row.parent_item_id === item.item_id),
  [allBomRows, item.item_id],
);
const usedIn = useMemo(
  () => allBomRows.filter((row) => row.child_item_id === item.item_id),
  [allBomRows, item.item_id],
);
```

`allBomRows` prop 은 부모(`AdminSectionContent`)가 이미 fetch 해서 전달 — 이 컴포넌트는 추가 API 호출 없음.

## 9. 자동 선택 동작

진입 시(또는 검색 후) 첫 번째 품목이 자동으로 선택된다.

```ts
// erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsSection.tsx (58-63)
useEffect(() => {
  if (addMode) return;
  if (selectedItem) return;
  if (visibleItems.length === 0) return;
  setSelectedItem(visibleItems[0]);
}, [addMode, selectedItem, visibleItems, setSelectedItem]);
```

## 10. 의존 관계

| 방향 | 대상 |
|---|---|
| 가져옴 | `useAdminMasterItemsContext` |
| 가져옴 | `AddItemForm`, `EditItemForm` (`_master_items_parts/`) |
| 가져옴 | `AdminDetailCard`, `AdminKpiBar`, `AdminListPanel`, `AdminPageHeader` (`_admin_primitives/`) |
| 사용됨 | `AdminSectionContent` → `items` 섹션에서 렌더 |

## 11. 관련 파일 / 시나리오

- `[[erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsContext.tsx]]`
- `[[erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/AddItemForm.tsx]]`
- `[[erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/EditItemForm.tsx]]`
- `[[erp/backend/app/routers/items.py]]` — CRUD API 라우터

> [!tip] 시나리오 매핑
> 품목 등록: "품목 추가" 버튼 → `addMode=true` → `AddItemForm` 렌더 → POST `/items` → context refetch → `visibleItems` 갱신 → 목록 자동 반영.
