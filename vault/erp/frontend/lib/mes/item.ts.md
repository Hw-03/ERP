---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/item.ts
tags: [vault, code-note, b-tier]
---

# item.ts — Item 도메인 유틸 (표시/판정/그룹핑)

> [!summary] 역할
> Item 객체 메모리 가공 함수. buildItemSearchLabel, itemMatchesKpi, groupedItems.

## 1. 이 파일의 역할
- buildItemSearchLabel(item) — "품목코드 / 품목명" 포맷 (검색 박스 표시)
- itemMatchesKpi(item, kpi) — KPI 라벨("정상"/"부족"/"품절") 일치 판정
- GroupedItem: { key, representative, quantity, count }
- groupedItems(items[]) — 품목명 기준 그룹화 (첫 Item representative, 수량 합산)

## 2. 실제 원본 위치
`frontend/lib/mes/item.ts` — 약 60줄

## 3. 주요 import
```typescript
import type { Item } from "@/lib/api";
```

## 4. 어디서 쓰이는지
- 재고 검색 박스 라벨 생성
- KPI 필터 (정상/부족/품절 별 타브)
- 품목명 그룹 조회 (다중 모델 같은 이름 통합)

## 5. ⚠️ 위험 포인트
- **itemMatchesKpi는 Item.quantity/min_stock 숫자 변환 후 비교** — Decimal 문자열이면 Number() 호출 (정밀도 손실)
- groupedItems는 낮은 케이스로 정규화하지만 trim은 미수행 — "재고" vs " 재고" 다르게 취급
- representative는 첫 등장 Item (메타 관점에서 대표성 없을 수 있음)

## 6. 수정 전 체크
- buildItemSearchLabel({ item_code: "3-AR-0001", item_name: "재고품" }) === "3-AR-0001 / 재고품" 확인
- itemMatchesKpi(item, "정상") — quantity=10, min_stock=5 → true 확인
- groupedItems 후 count = 원본 item 개수, quantity = 합산 확인
