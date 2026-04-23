---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopLegacyShell.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - shell
aliases:
  - 데스크톱 쉘
  - 메인 레이아웃 컴포넌트
---

# DesktopLegacyShell.tsx

> [!summary] 역할
> 데스크톱 화면의 전체 레이아웃을 담당하는 최상위 쉘 컴포넌트.
> 사이드바, 탭 전환, 각 탭별 뷰 렌더링을 조율한다.

> [!info] 주요 책임
> - 현재 활성 탭 상태 관리 (`inventory` / `warehouse` / `admin`)
> - 사이드바 렌더링 (`DesktopSidebar`)
> - 탭별 뷰 컴포넌트 조건부 렌더링
> - 전역 알림 배너 표시

> [!warning] 주의
> - 활성 탭은 정확히 3개: `inventory`, `warehouse`, `admin`
> - 이 파일이 데스크톱 UI의 실질적인 진입점이다
> - 탭 추가/제거 시 이 파일을 수정해야 함

---

## 쉬운 말로 설명

**레거시 데스크톱 UI의 최상위 프레임**. 화면을 좌측 사이드바 + 상단 탑바 + 우측 본문으로 나누고, 사이드바에서 탭을 누르면 본문을 갈아 끼우는 구조.

탭 4개: **대시보드(inventory) / 입출고(warehouse) / 내역(history) / 관리자(admin)**. 상태(`activeTab`)에 따라 `DesktopInventoryView` / `DesktopWarehouseView` / `DesktopHistoryView` / `DesktopAdminView` 중 하나를 렌더.

`refreshNonce` 를 `key` 로 붙여 새로고침 버튼 누르면 자식 컴포넌트 전체 re-mount.

---

## 상태

| 상태 | 타입 | 역할 |
|------|------|------|
| `activeTab` | `DesktopTabId` | 현재 활성 탭 |
| `status` | `string` | 탑바에 표시되는 메시지 |
| `refreshNonce` | `number` | 새로고침 시 증가 (자식 리마운트 트리거) |
| `warehousePreselected` | `Item \| null` | 대시보드에서 품목 클릭 시 입출고 탭으로 이동할 때 사전 선택 |

---

## 주요 흐름

```
사용자가 대시보드에서 품목 클릭 → onGoToWarehouse(item)
  → setWarehousePreselected(item) + setActiveTab("warehouse")
  → DesktopWarehouseView 가 preselectedItem 받아서 해당 품목 미리 선택된 상태로 열림
```

---

## FAQ

**Q. 탭 추가하려면?**
`DesktopSidebar` 의 `DesktopTabId` 타입에 새 값 추가 + `TAB_META` 에 엔트리 + `content` useMemo 의 분기에 새 뷰 추가.

**Q. `lg:flex` 숨김 처리는?**
`className="hidden ... lg:flex"` — 모바일(`<1024px`)에선 숨기고 PC에서만 표시. 모바일은 별도 레이아웃(LegacyLayout) 이 담당.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopSidebar.tsx.md]]
- [[frontend/app/legacy/_components/DesktopTopbar.tsx.md]]
- [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]]
- [[frontend/app/legacy/_components/AlertsBanner.tsx.md]]
- [[frontend/app/legacy/_components/legacyUi.ts.md]] — `LEGACY_COLORS`

Up: [[frontend/app/legacy/_components/_components]]
