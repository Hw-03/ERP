---
type: index
project: ERP
layer: frontend
source_path: frontend/app/legacy/
status: active
tags:
  - erp
  - frontend
  - legacy
  - ui
aliases:
  - 레거시 UI
  - 활성 메인 UI
---

# frontend/app/legacy

> [!summary] 역할
> 현재 실제로 동작하는 메인 UI가 있는 폴더.
> 이름은 "legacy"지만 현재 **활성 운영 화면**이다. 루트 접속 시 이 UI가 렌더링된다.

> [!warning] 주의
> - 이름 때문에 비활성/구버전으로 오해하기 쉬우나, **실제 서비스 중인 UI**이다.
> - 데스크톱과 모바일 대응이 모두 이 폴더에 있다.

## 하위 문서

- [[frontend/app/legacy/page.tsx.md]] — 레거시 UI 진입점

## 하위 폴더

- [[frontend/app/legacy/_components/_components]] — 화면 컴포넌트 전체

## 활성 탭 구조 (데스크톱)

| 탭 | 설명 | 담당 컴포넌트 |
|----|------|---------------|
| inventory | 재고 현황 조회 | [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] |
| warehouse | 입출고 작업 | [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] |
| admin | 관리자 (핀락) | [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] |

---

## 쉬운 말로 설명

이름은 `legacy`(구버전)지만 **실제 쓰는 메인 UI**. 별명이 좀 헷갈리게 붙었는데, 새 UI로 교체하는 작업이 진행 중이라 현재 것을 "legacy"라고 부르는 것뿐이다.

내부 구조:
- `page.tsx` — 진입점. 화면 크기에 따라 데스크톱/모바일 분기.
- `_components/` — 실제 UI 블록들 (19개).

---

## 화면 전환 구조

```
legacy/page.tsx
   ├─ (큰 화면) DesktopLegacyShell
   │    ├─ DesktopSidebar (좌측 탭 메뉴)
   │    ├─ DesktopTopbar
   │    ├─ 탭별 뷰 (inventory / warehouse / admin / history)
   │    └─ DesktopRightPanel (우측 선택 목록)
   │
   └─ (작은 화면) LegacyLayout
        ├─ InventoryTab
        ├─ WarehouseIOTab
        ├─ DeptIOTab
        ├─ HistoryTab
        └─ AdminTab
```

---

## 탭별 담당 작업

| 탭 | 작업 |
|----|------|
| inventory | 품목 검색, 재고 수량 확인 |
| warehouse | 입고, 출고, 창고-부서 이관 |
| dept (모바일만) | 부서간 이동 |
| history | 거래 이력 조회, 필터 |
| admin | 관리자 기능 (PIN 필요) |

---

## FAQ

**Q. 왜 legacy라는 이름이 붙었나?**
새 UI 전환 작업이 있었지만 현재는 이것이 주력. 리네이밍하지 않은 채 계속 확장되는 중.

**Q. 데스크톱/모바일 구분 기준?**
Tailwind의 `lg:` (1024px). 이상은 데스크톱 뷰, 미만은 탭 UI.

**Q. 탭 간 상태 공유는?**
`legacy/page.tsx` 에서 `useState` 로 선언된 `activeTab`, `selectedItems` 등 상위 상태를 props로 내려보냄 (prop drilling 패턴).

---

## 관련 문서

- [[frontend/app/legacy/_components/_components]]
- [[frontend/app/legacy/page.tsx.md]] — 진입점
- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] ⭐
- [[frontend/app/legacy/_components/LegacyLayout.tsx.md]] — 모바일 루트
- 재고 입출고 시나리오

Up: [[frontend/app/app]]
