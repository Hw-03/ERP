---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/SelectedItemsPanel.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - warehouse
  - ui
aliases:
  - 선택 품목 패널
---

# SelectedItemsPanel.tsx

> [!summary] 역할
> 창고 입출고 작업 시 **선택된 품목 목록과 수량**을 표시하는 패널.
> 수량 변경과 품목 제거 기능을 제공하며, 선택 항목이 없으면 렌더링하지 않는다.

> [!info] 표시 내용
> - 선택된 각 품목의 ERP 코드 배지, 품명
> - 수량 입력 필드 (직접 수정 가능)
> - 품목 제거 버튼 (X)
> - `outgoing` prop으로 출고 모드 표시 조절

## Props

| Prop | 설명 |
|------|------|
| `entries` | 선택된 품목 배열 `{ item, quantity }[]` |
| `onQuantityChange` | 수량 변경 콜백 |
| `onRemove` | 품목 제거 콜백 |
| `outgoing` | 출고 모드 여부 (기본 false) |

---

## 쉬운 말로 설명

**장바구니 같은 위젯**. 창고 입출고 화면에서 여러 품목을 한 번에 처리할 때, 지금 뭘 몇 개 선택했는지 보여주는 임시 리스트. 항목이 0개면 화면에서 사라짐.

예: 입고 작업 중
- 품목 검색 → "메인보드" 추가 → 수량 10
- "고정판" 추가 → 수량 5
- "나사" 추가 → 수량 100
- 최종적으로 "입고 확정" → 3개 품목 한꺼번에 RECEIVE 처리

## 내부 동작

- `entries` 배열을 `.map()` 으로 렌더링
- 각 row에 수량 input + X 버튼
- `onQuantityChange(itemId, newQty)` — input 변경 시
- `onRemove(itemId)` — X 버튼 클릭 시
- `outgoing=true` 면 "출고"로 표시 (배지 색상/문구 변화)

## FAQ

**Q. 수량 0이면?**
입력은 가능하지만 상위 컴포넌트에서 0 제외하고 API 전송하는 게 일반적. UI 상으론 에러 표시 없음.

**Q. 같은 품목 두 번 추가하면?**
상위 로직에서 처리. 보통 기존 수량에 합산하거나 중복 거부. `SelectedItemsPanel` 자체는 `entries` 그대로 표시.

**Q. 전체 비우기?**
각 항목 X 반복. 일괄 삭제 버튼은 없음 — 필요하면 상위에 추가.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — 창고 뷰 (패널 사용)
- [[frontend/app/legacy/_components/WarehouseIOTab.tsx.md]] — 창고 입출고 탭

Up: [[frontend/app/legacy/_components/_components]]
