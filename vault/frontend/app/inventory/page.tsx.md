---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/inventory/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - inventory
aliases:
  - 재고 페이지 라우트
---

# app/inventory/page.tsx

> [!summary] 역할
> `/inventory` 경로 접속 시 루트(`/`)로 리다이렉트하는 래퍼 파일.
> 실제 재고 조회 UI는 레거시 UI의 `DesktopInventoryView` 탭에 있다.

---

## 쉬운 말로 설명

**`/inventory` → `/` 리디렉션**. 재고 조회는 레거시 UI "재고" 탭에서. 가장 자주 쓰이는 화면이라 기본 진입점이기도 함.

재고 3-bucket 모델:
- **창고(warehouse_qty)** — 메인 자재창고 보유분
- **부서 버킷(production 버킷들)** — 튜브/고압/진공/튜닝/조립/출하 부서가 끌어간 작업 중 재고
- **불량 버킷(defective)** — 불량 판정된 재고 (공급사 반품 대기)

총재고 = warehouse_qty + 모든 부서 production 합 + defective 합

## FAQ

**Q. 화면상 재고 ≠ 실제 창고?**
부서 버킷이 쌓여있을 가능성. "창고" 수치 외에 부서별 상세도 확인.

**Q. 재고 0인데 출고 시도?**
백엔드 `reserve_pending()` 에서 예외. 프론트 토스트로 "재고 부족" 표시.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] — 실제 재고 뷰 (데스크톱)
- [[frontend/app/legacy/_components/InventoryTab.tsx.md]] — 모바일 버전
- [[frontend/app/inventory/inventory]] — 라우트 폴더 인덱스
- 재고 입출고 시나리오 — 입출고 전체 흐름

Up: [[frontend/app/app]]
