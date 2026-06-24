# useItemOrderDrag.ts

## 이 파일은 뭐예요?
Pointer Events 기반 드래그 재정렬 훅입니다. `GripVertical` 핸들 포인터 이벤트를 통해 `data-item-id` 선택자로 드롭 대상을 찾고, 완료 시 재배열된 배열을 콜백(`onReorder`)으로 전달합니다.

## 언제 보나요?
- `IoTargetPicker`의 "순서 편집" 모드에서 품목 행을 드래그로 재정렬할 때

## 중요한 내용
- `useItemOrderDrag<T extends { item_id: string }>(items, onReorder)` — 제네릭 훅
- `makeHandlers(id)` — 행별 `onPointerDown/Move/Up + style` 객체 반환; GripVertical에 스프레드
- 5px 임계값 초과 시 드래그 시작으로 인식
- `elementFromPoint` + `closest("[data-item-id]")`로 드롭 위치 결정
- pointer capture로 핸들 벗어나도 이벤트 유지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx]] — 이 훅을 "순서 편집" 테이블에서 사용하는 호출처
