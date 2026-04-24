---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/WarehouseIOTab.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - mobile
  - warehouse
aliases:
  - 창고 입출고 탭 (모바일)
---

# WarehouseIOTab.tsx

> [!summary] 역할
> 모바일 화면에서 **창고 직접 입출고 작업**을 처리하는 탭 컴포넌트.
> 창고→생산부, 생산부→창고, 창고 직접 입고 3가지 모드를 지원한다.

> [!info] 3가지 작업 모드
> | 모드 | 방향 | 설명 |
> |------|------|------|
> | `wh2d` | 창고 → 생산부 | 자재 불출 |
> | `d2wh` | 생산부 → 창고 | 반납/반환 |
> | `whin` | 외부 → 창고 | 신규 입고 |

> [!info] 처리 흐름
> 1. 모드 선택
> 2. 담당 직원 선택
> 3. 품목 검색 → `SelectedItemsPanel`에 추가
> 4. 수량 확인 후 실행 → API 호출

> [!warning] 주의
> `DeptIOTab` 과 역할이 유사하지만, DeptIOTab은 부서를 먼저 선택하는 반면
> 이 컴포넌트는 모드(방향)를 먼저 선택하는 흐름이다.

---

## 쉬운 말로 설명

**모바일 "입출고 탭"**. 3가지 모드 버튼으로 시작 → 직원 선택 → 품목 여러 개 장바구니처럼 담기 → 최종 실행. 데스크톱 `DesktopWarehouseView` 의 `warehouse-io` 탭과 같은 기능.

예 (wh2d: 창고→생산부):
1. "창고→생산부" 버튼 클릭
2. 담당: 김철수(조립) 선택
3. "메인보드" 검색 → 10개 추가
4. "나사" 추가 → 50개
5. "실행" 버튼 → 백엔드 API: `POST /inventory/transfer-to-production` (품목 배열 한 번에 처리)

## 내부 처리

```
mode 선택 → employee 선택 → items 추가 → 실행
                                          │
                                          ▼
                    wh2d  → transfer_to_production()
                    d2wh  → transfer_to_warehouse()
                    whin  → receive()
```

- 상태: `mode`, `employeeId`, `entries: {item, quantity}[]`
- `SelectedItemsPanel` 로 `entries` 시각화
- 실행 후 `onComplete()` → 상위가 재고/이력 재조회

## FAQ

**Q. DeptIOTab 과 어느 쪽을 써야?**
- `WarehouseIOTab`: 창고 기준 관점 ("창고에서 나가는/들어오는 걸 본다")
- `DeptIOTab`: 부서 기준 관점 ("이 부서로 뭘 넘길지 본다")
실제로 같은 API 를 다른 순서의 UX 로 호출. 화면 상황에 따라 선택.

**Q. 불량 등록이나 공급사 반품은?**
이 탭에서 X. 데스크톱 `DesktopWarehouseView` 의 `defective-register`, `supplier-return` 탭에서만 가능.

**Q. 직원 선택 안 하고 실행?**
API 필수 필드이므로 프론트에서 막음. 버튼 비활성화.

---

## 관련 문서

- [[frontend/app/legacy/_components/DeptIOTab.tsx.md]] — 부서 기준 입출고
- [[frontend/app/legacy/_components/SelectedItemsPanel.tsx.md]] — 선택 품목 패널
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — 데스크탑 버전
- [[backend/app/routers/inventory.py.md]] — transfer/receive API

Up: [[frontend/app/legacy/_components/_components]]
