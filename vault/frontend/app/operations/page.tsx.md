---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/operations/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - operations
aliases:
  - 작업 페이지 라우트
---

# app/operations/page.tsx

> [!summary] 역할
> `/operations` 경로 접속 시 루트(`/`)로 리다이렉트하는 래퍼 파일.
> 창고 입출고 작업은 레거시 UI의 `DesktopWarehouseView` 탭에서 처리한다.

---

## 쉬운 말로 설명

**`/operations` → `/` 리디렉션**. 입출고·이동 등 "작업(operation)" 은 레거시 `DesktopWarehouseView` 탭 안의 6개 WORK_TYPE 으로 구현.

WORK_TYPES 요약:
- `raw-io` — 원자재 입고/출고
- `warehouse-io` — 창고↔공급사 (외부)
- `dept-io` — 창고↔부서 이동
- `package-out` — 출하 패키지 출고
- `defective-register` — 불량 등록 (창고→불량 버킷)
- `supplier-return` — 불량 → 공급사 반품

## FAQ

**Q. 한 화면에서 여러 작업 동시?**
X. 한 번에 한 작업 유형만. 상단 탭으로 전환.

**Q. 작업 실행 후 취소?**
`ADJUST` 로 반대 방향 수동 처리. 자동 롤백은 없음.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — 실제 창고 뷰
- [[frontend/app/legacy/_components/WarehouseIOTab.tsx.md]], [[frontend/app/legacy/_components/DeptIOTab.tsx.md]] — 모바일 버전
- [[frontend/app/operations/operations]] — 라우트 폴더 인덱스

Up: [[frontend/app/app]]
