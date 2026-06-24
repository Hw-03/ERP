# ItemDetailActionForm.tsx

## 이 파일은 뭐예요?
품목 상세 시트(ItemDetailSheet)에서 수량 조정(`ADJUST`) 또는 입고(`RECEIVE`) 작업을 수행하는 폼 컴포넌트입니다. 모드 선택·수량 입력·스텝 버튼(±1·±10)·비고·제출 버튼을 담습니다.

## 언제 보나요?
- 재고 화면에서 특정 품목을 선택해 수량을 조정하거나 입고할 때

## 중요한 내용
- `ItemDetailActionForm(ItemDetailActionFormProps)` — 상태를 모두 외부에서 주입받는 순수 UI
- `ItemDetailActionMode = "ADJUST" | "RECEIVE"` — 모드 타입 export
- `bump(delta)` — ±1·±10 스텝 버튼 핸들러를 호출자가 구현해 전달
- `ADJUST` 모드: "최종 수량" 라벨, 초기값=현재재고 / `RECEIVE` 모드: "처리 수량" 라벨, 초기값=1

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰
