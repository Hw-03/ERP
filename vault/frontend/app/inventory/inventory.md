---
type: index
project: ERP
layer: frontend
source_path: frontend/app/inventory/
status: active
tags:
  - erp
  - frontend
  - route
  - inventory
aliases:
  - 재고 페이지
---

# frontend/app/inventory

> [!summary] 역할
> `/inventory` 경로의 라우트 폴더. `page.tsx`가 재고 화면을 렌더링한다.

> [!warning] 주의
> - 현재 메인 재고 UI는 `legacy/DesktopInventoryView.tsx`에 있음
> - 이 폴더의 page.tsx는 새 UI 작업의 일부이거나 legacy로 연결될 수 있음

## 하위 문서

- [[frontend/app/inventory/page.tsx.md]] — 재고 현황 페이지

---

## 쉬운 말로 설명

`/inventory` URL로 접속 시 렌더링되는 페이지 폴더. 다만 **실제 메인 재고 UI는 레거시에 있고**, 이 폴더의 page.tsx는 새 UI 전환 작업의 흔적일 가능성.

### 실제 재고 화면은 어디?
- 데스크톱: [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]]
- 모바일: [[frontend/app/legacy/_components/InventoryTab.tsx.md]]

---

## FAQ

**Q. 이 페이지와 legacy 재고 탭 중 어느 게 진짜?**
일반 사용자는 `/` 루트로 접속 → legacy로 리다이렉트. `/inventory` 로 직접 접속 시 이 page.tsx 가 뜨는데, 실제 구현이 legacy 를 래핑한 것인지 별도 UI 인지는 page.tsx 파일 확인 필요.

---

## 관련 문서

- [[backend/app/routers/inventory.py.md]] — 호출하는 백엔드 API
- [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] — 실제 UI
- 재고 입출고 시나리오

Up: [[frontend/app/app]]
