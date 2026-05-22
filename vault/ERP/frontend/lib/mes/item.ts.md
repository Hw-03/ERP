---
type: file-explanation
source_path: "frontend/lib/mes/item.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# item.ts — item.ts 설명

## 이 파일은 무엇을 책임지나

`item.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `buildItemSearchLabel`
- `itemMatchesKpi`
- `groupedItems`
- `GroupedItem`

## 연결되는 파일

- [[ERP/frontend/lib/mes/📁_mes]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * MES Item 도메인 유틸 — `@/lib/mes/item`.
 *
 * Round-10E (#6/7/8) 신설. legacyUi.ts 의 Item 도메인 4 함수 정본 위치.
 *
 * 본 모듈의 모든 함수는 메모리상 Item 객체를 입력으로 받아 가공만 한다 —
 * 네트워크 호출/스키마 변경/DB 의존 없음. lib/api/items.ts 와는 책임 분리:
 *   - `lib/api/items.ts` — CRUD / fetch
 *   - `lib/mes/item.ts` — 표시/판정/그룹핑 utility
 */

import type { Item } from "@/lib/api";

/**
 * Item 검색 박스 표시용 라벨 — "품목코드 / 품목명".
 */
export function buildItemSearchLabel(item: Item): string {
  return `${item.item_code} / ${item.item_name}`;
}

/**
 * Item 이 KPI 라벨 ("정상" / "부족" / "품절") 에 해당하는지 판정.
 *   - 정상: quantity > 0 && (min_stock 무 || quantity >= min_stock)
 *   - 부족: quantity > 0 && min_stock != null && quantity < min_stock
 *   - 품절: quantity <= 0
 *   - 그 외 (전체 등): true
 */
export function itemMatchesKpi(item: Item, kpi: string): boolean {
  const qty = Number(item.quantity);
  const min = item.min_stock == null ? null : Number(item.min_stock);
  if (kpi === "정상") return qty > 0 && !(min != null && qty < min);
  if (kpi === "부족") return qty > 0 && min != null && qty < min;
  if (kpi === "품절") return qty <= 0;
  return true;
}

export interface GroupedItem {
  key: string;
  representative: Item;
  quantity: number;
  count: number;
}

/**
 * Item[] 을 품목명 (대소문자 무시 + trim) 기준으로 그룹화.
 * 각 그룹은 첫 등장 Item 을 representative 로, 수량/개수 합산.
 */
export function groupedItems(items: Item[]): GroupedItem[] {
  const map = new Map<string, GroupedItem>();
  for (const item of items) {
    const key = item.item_name.trim().toLowerCase();
    const current = map.get(key);
    if (current) {
      current.quantity += Number(item.quantity);
      current.count += 1;
```
