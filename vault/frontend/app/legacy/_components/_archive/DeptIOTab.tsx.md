---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DeptIOTab.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - mobile
  - warehouse
aliases:
  - 부서 입출고 탭 (모바일)
---

# DeptIOTab.tsx

> [!summary] 역할
> 모바일 화면에서 **부서별 자재 입출고 작업**을 처리하는 탭 컴포넌트.
> 창고↔생산부 간 자재 이동, 창고 직접 입고 3가지 모드를 지원한다.

> [!info] 3가지 입출고 모드
> | 모드 | 아이콘 | 방향 |
> |------|--------|------|
> | `wh2d` | 🏭→🔧 | 창고 → 생산부 |
> | `d2wh` | 🔧→🏭 | 생산부 → 창고 |
> | `whin` | 📥 | 외부 → 창고 입고 |

> [!info] 처리 흐름
> 1. 부서 선택 (튜브/고압/진공/튜닝/조립/출하)
> 2. 담당 직원 선택
> 3. 품목 검색 및 수량 입력
> 4. 확인 후 API 호출로 재고 이동 처리

---

## 쉬운 말로 설명

**모바일 "부서 입출고 탭"**. `WarehouseIOTab` 과 기능은 비슷하지만 **부서 먼저 고른 뒤** 나머지 진행. "조립부서 관점에서 뭘 받을지/넘길지" 설계.

예 (wh2d + 조립):
1. 부서: 조립 선택
2. 모드: 창고→부서 (wh2d)
3. 담당: 홍길동
4. 품목: 메인보드 10개, 나사 100개
5. 실행 → 창고에서 조립부서로 이동

## WarehouseIOTab 과 차이

| 항목 | `WarehouseIOTab` | `DeptIOTab` |
|------|-----------------|-------------|
| 최초 선택 | 모드(방향) | 부서 |
| 화면 구성 | 모드 칩 상단 | 부서 칩 상단 |
| 대표 사용 | 창고 담당자 | 부서 담당자 |
| 호출 API | 동일 (transfer*, receive) |

## FAQ

**Q. 출하부서(FG) 에도 입출고?**
가능. 완성품이 출하부서 버킷으로 이동하거나, 반대로 창고로 반납될 때.

**Q. 부서 간 직접 이동?**
이 탭에선 X (창고 거쳐야 함). 부서↔부서 직접 이동은 데스크톱 `DesktopWarehouseView` 의 `dept-io` 탭 사용.

**Q. 부서 추가하려면?**
`legacyUi.ts` + `api.ts` 의 Department 타입 + 백엔드 `CATEGORY_TO_DEPT` 매핑까지 전부 수정.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — 데스크탑 창고 뷰
- [[frontend/app/legacy/_components/WarehouseIOTab.tsx.md]] — 창고 직접 입출고 탭
- [[frontend/app/legacy/_components/legacyUi.ts.md]] — 부서 라벨/아이콘/색상

Up: [[frontend/app/legacy/_components/_components]]
