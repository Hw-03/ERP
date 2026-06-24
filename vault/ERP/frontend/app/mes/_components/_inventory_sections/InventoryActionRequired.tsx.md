# InventoryActionRequired.tsx

## 이 파일은 뭐예요?
재고 화면 상단에 표시하는 "조치 필요" 경보 배너입니다. 안전재고 미달(부족)과 품절 건수를 받아서 0건이면 아무것도 렌더하지 않고, 1건 이상이면 주황/빨강 톤의 배너와 "입출고 화면 열기" 버튼을 표시합니다.

## 언제 보나요?
- 재고 화면에서 부족(lowCount > 0) 또는 품절(zeroCount > 0) 품목이 있을 때
- 품절이 있으면 빨강, 부족만 있으면 노란색 톤으로 배너 색이 달라짐

## 중요한 내용
- `Props`: `lowCount`, `zeroCount`, `onGoToWarehouseTab?` (옵션 — 없으면 버튼 미표시)
- `total === 0`이면 `null` 반환 (렌더 스킵)
- 색상 결정: `zeroCount > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.yellow`
- `onGoToWarehouseTab`이 주어지면 "입출고 화면 열기" 버튼 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 토큰
- [[ERP/frontend/lib/mes/format.ts]] — `formatQty` 수량 포맷
