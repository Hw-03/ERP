---
type: file-explanation
source_path: "frontend/lib/mes/inventory.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# inventory.ts — inventory.ts 설명

## 이 파일은 무엇을 책임지나

`inventory.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `getStockState`
- `LEGACY_FILE_TYPES`
- `LEGACY_PARTS`
- `StockState`

## 연결되는 파일

- [[ERP/frontend/lib/mes/📁_mes]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * MES 재고 (Inventory) 유틸 — `@/lib/mes/inventory`.
 *
 * Round-10D (#6) 신설. legacyUi.ts 의 재고 상태 판정 정본 위치.
 * Round-10E (#3) 추가: legacy 재고 필터 옵션 상수 (FILE_TYPES/PARTS/MODELS) 흡수.
 */

import { LEGACY_COLORS } from "./color";

export interface StockState {
  label: "정상" | "부족" | "품절";
  color: string;
}

/**
 * 재고 수량 + 최소재고 → 상태 라벨/색상.
 *   - quantity <= 0: 품절 (red)
 *   - 0 < quantity < minStock: 부족 (yellow)
 *   - else: 정상 (green)
 *   - minStock null/undefined: 정상 판정 (부족 분기 미적용)
 */
export function getStockState(quantity: number, minStock?: number | null): StockState {
  if (quantity <= 0) {
    return { label: "품절", color: LEGACY_COLORS.red };
  }
  if (minStock != null && quantity < minStock) {
    return { label: "부족", color: LEGACY_COLORS.yellow };
  }
  return { label: "정상", color: LEGACY_COLORS.green };
}

/**
 * legacy 재고 필터 옵션 상수.
 *   - LEGACY_FILE_TYPES — 자료 종류 필터 (현재 "전체" 단일)
 *   - LEGACY_PARTS — 파트 (자재창고/조립출하/부서별 파트)
 *
 * UI 의 select / chip 옵션 메타. "전체" 는 필터 미적용 의미 (DB 값 아님).
 */
export const LEGACY_FILE_TYPES = ["전체"] as const;
export const LEGACY_PARTS = ["전체", "자재창고", "조립출하", "고압파트", "진공파트", "튜닝파트"] as const;
```
