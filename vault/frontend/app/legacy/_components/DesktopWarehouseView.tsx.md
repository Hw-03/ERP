---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopWarehouseView.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - warehouse
  - operations
aliases:
  - 입출고 작업 화면
  - 창고 뷰
---

# DesktopWarehouseView.tsx

> [!summary] 역할
> 데스크톱 입출고 작업 탭의 메인 화면. 원자재 입출고, 창고 이관, 부서 이관, 패키지 출하를 처리한다.

> [!info] 주요 책임
> - 좌측: 작업 그룹 선택 패널 (원자재 입출고 / 창고 입출고 / 부서 입출고 / 패키지 출하)
> - 우측: 작업 확인/실행 패널 (품목 검색, 수량 입력, 확정)
> - 작업 그룹별 방향 버튼 표시 (입고/출고 등)

> [!warning] 주의
> - 수량 입력 컨트롤은 우측 확인 패널에만 있음 (이전에는 좌측이었음)
> - 실제 재고 변동은 `lib/api.ts`의 해당 API 함수를 통해 발생

---

## 쉬운 말로 설명

**입출고 탭** — 실제 재고가 움직이는 대부분의 작업을 여기서 처리. 6가지 작업 그룹(`WORK_TYPES`):

| WorkType | 용도 | 호출 API |
|----------|------|---------|
| `raw-io` | 원자재 입출고 (외부 ↔ 창고) | `receiveInventory`, `shipInventory` |
| `warehouse-io` | 창고 ↔ 부서 이동 | `transferToProduction`, `transferToWarehouse` |
| `dept-io` | 부서 간 이동 | `transferBetweenDepts` |
| `package-out` | 패키지 출고 (묶음 한 번에) | `shipPackage` |
| `defective-register` | 불량 등록 (창고/부서 → DEFECTIVE) | `markDefective` |
| `supplier-return` | 공급사 반품 (DEFECTIVE 소진) | `returnToSupplier` |

---

## 화면 구조

```
┌──────────────────┬────────────────┐
│ 좌측: 품목 검색  │ 중앙: 작업 그룹 │
│ + 목록           │ 선택 / 방향     │
│                  │ (raw-io 등)    │
│                  │                │
│                  │ 하단: 선택된   │
│                  │ 품목 패널      │
│                  │ (수량 입력)    │
├──────────────────┤                │
│ 우측: 상세/확정  │                │
└──────────────────┴────────────────┘
```

---

## 주요 Props

```typescript
{
  globalSearch: string;
  onStatusChange: (msg: string) => void;
  preselectedItem: Item | null;  // 대시보드에서 품목 클릭하고 이동한 경우 자동 선택
}
```

---

## 내부 상태 주요 흐름

```
1. workType 선택 (raw-io, dept-io, ...)
2. 품목 검색/선택 → selectedItems 배열 append
3. 수량 입력 + 방향 선택 + 담당자 선택
4. "확정" 버튼 → api.XXX() 호출
5. 성공: 품목 목록 새로고침 + Toast 알림
   실패: 에러 Toast
```

---

## FAQ

**Q. "창고 이동" vs "부서 입출고" 뭐가 다름?**
- 창고 이동(`warehouse-io`): 창고 ↔ 특정 부서. 방향 2종류.
- 부서 입출고(`dept-io`): 부서 A → 부서 B. 창고 통과 없음.

**Q. 불량 등록하면 재고가 사라지나?**
아님. 정상 버킷(창고/부서)에서 차감되고 **DEFECTIVE 버킷으로 이동**. 총수량은 보존. 이후 `supplier-return` 으로 최종 반품.

**Q. 패키지 출고가 뭐임?**
관리자 탭에서 미리 등록한 "출하 패키지 템플릿"(여러 품목 묶음). 승수(×2, ×3) 지정 → 구성품 한꺼번에 출고.

**Q. 수량 음수 입력 방지?**
컨트롤에서 min=0. 또한 백엔드에서 422 로 재검증.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]]
- [[frontend/app/legacy/_components/DesktopRightPanel.tsx.md]]
- [[frontend/app/legacy/_components/SelectedItemsPanel.tsx.md]]
- [[frontend/lib/api.ts.md]]
- [[backend/app/routers/inventory.py.md]]
- 재고 입출고 시나리오

Up: [[frontend/app/legacy/_components/_components]]
