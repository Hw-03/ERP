---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/ItemDetailSheet.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - mobile
  - inventory
aliases:
  - 품목 상세 시트
---

# ItemDetailSheet.tsx

> [!summary] 역할
> 특정 품목을 선택했을 때 하단에서 올라오는 **상세 정보 + 재고 조작 패널**.
> 조정(ADJUST), 입고(RECEIVE), 출고(SHIP) 3가지 액션을 직접 수행할 수 있다.

> [!info] 표시 정보
> - 품번(ERP 코드), 품명, 카테고리 배지
> - 현재 창고 재고 + 부서별 재고
> - 최근 거래 이력 (최신 5건)

> [!info] 재고 조작 액션
> | 액션 | 설명 |
> |------|------|
> | ADJUST | 재고 수량 직접 조정 (플러스/마이너스) |
> | RECEIVE | 입고 처리 |
> | SHIP | 출고 처리 |

> [!warning] 주의
> - `BottomSheet` 위에 렌더링됨
> - 저장 후 `onSaved` 콜백으로 부모 컴포넌트에 업데이트된 품목 데이터 전달

---

## 쉬운 말로 설명

**모바일에서 품목 하나 터치하면 올라오는 상세 카드**. PC용 `DesktopRightPanel` 의 모바일 버전. 품목 정보 확인 + 간단 재고 조작(±버튼, 입고, 출고)을 한 화면에서 처리.

예: 재고 목록에서 "ADX4000W 메인보드" 터치 → 바텀시트 올라옴 → 현재 수량 120개 확인 → "-5" 버튼 → "조정 저장" → 시트 닫힘 + 목록 갱신.

## 표시 구조

```
─────────────────────────
 [배지] ERP코드: 3-AR-0001
 품명: 메인보드 Type-A
─────────────────────────
 창고재고: 120
 조립부서:  34
 출하부서:  12
─────────────────────────
 [수량 조정 입력박스]
 [ ADJUST ] [ RECEIVE ] [ SHIP ]
─────────────────────────
 최근 거래 (5건)
 04/22 +10 RECEIVE 홍길동
 04/21 -5  SHIP     김철수
 ...
```

## 내부 처리 흐름

1. `item` prop 변경 → `GET /items/{id}/history?limit=5` 재조회
2. 액션 버튼 클릭 → 해당 API 호출:
   - ADJUST → `POST /inventory/adjust`
   - RECEIVE → `POST /inventory/receive`
   - SHIP → `POST /inventory/ship`
3. 성공 시 `onSaved(updatedItem)` 콜백 → 부모(`InventoryTab`)가 목록 갱신
4. 실패 시 토스트 에러 표시 후 시트 유지

## FAQ

**Q. ADJUST vs RECEIVE 차이?**
- RECEIVE: 협력사로부터 **입고**, 이력에 공급사 정보 포함
- ADJUST: **수량만 보정** (실사 차이, 단순 오입력 정정 등)

**Q. 마이너스 조정 가능?**
가능. `-5` 같은 음수 입력 → ADJUST 로 처리.

**Q. 부서별 재고 조정은?**
이 시트에선 창고 재고만. 부서 이동은 `DeptIOTab` / `DesktopWarehouseView` 의 "부서-창고 I/O" 탭에서.

**Q. 이력 5건 이상?**
더보기 버튼 없음. 전체 이력은 `HistoryTab` 이나 데스크톱 이력 뷰에서 확인.

---

## 관련 문서

- [[frontend/app/legacy/_components/BottomSheet.tsx.md]] — 바텀시트 컨테이너
- [[frontend/app/legacy/_components/InventoryTab.tsx.md]] — 재고 탭 (호출 주체)
- [[frontend/app/legacy/_components/DesktopRightPanel.tsx.md]] — 데스크톱 버전
- [[backend/app/routers/inventory.py.md]] — 조정/입고/출고 API

Up: [[frontend/app/legacy/_components/_components]]
