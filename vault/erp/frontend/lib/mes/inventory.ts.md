---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/inventory.ts
tags: [vault, code-note, b-tier]
---

# inventory.ts — MES 재고 상태 판정 유틸

> [!summary] 역할
> 재고 수량 + 최소재고 → 상태(정상/부족/품절) + 색상. 필터 옵션 상수(FILE_TYPES/PARTS/MODELS).

## 1. 이 파일의 역할
- StockState: { label: "정상" | "부족" | "품절", color: string }
- getStockState(quantity, minStock?) — 상태 판정:
  - quantity <= 0: 품절 (red)
  - 0 < quantity < minStock: 부족 (yellow), minStock null/undefined: 정상
  - else: 정상 (green)
- LEGACY_FILE_TYPES, LEGACY_PARTS — 필터 UI 옵션

## 2. 실제 원본 위치
`frontend/lib/mes/inventory.ts` — 41줄

## 3. 주요 import
```typescript
import { LEGACY_COLORS } from "./color";
```

## 4. 어디서 쓰이는지
- 재고 목록/상세 UI에서 상태 배지 표시
- 부족/품절 강조 (색상)
- 필터 select/chip 옵션

## 5. ⚠️ 위험 포인트
- **minStock null/undefined 구분 안 함** — "전체"와 "정상" 판정 모호
- LEGACY_PARTS 정의 ("전체", "자재창고", ...) — DB와 싱크 필요
- FILE_TYPES = ["전체"] 단일 — 향후 "구매", "생산" 등 추가 예정?

## 6. 수정 전 체크
- getStockState(5, 10) === { label: "부족", color: LEGACY_COLORS.yellow } 확인
- getStockState(0, 10) === { label: "품절", ... } 확인
- getStockState(15, undefined) === { label: "정상", ... } 확인
