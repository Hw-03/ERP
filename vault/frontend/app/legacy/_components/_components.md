---
type: index
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
aliases:
  - 레거시 컴포넌트 목록
---

# frontend/app/legacy/_components

> [!summary] 역할
> 현재 메인 UI를 이루는 데스크톱/모바일 컴포넌트 묶음.
> 이번 브랜치에서는 모바일 하위 폴더가 크게 늘고, 예전 탭 구현 일부는 `_archive` 로 이동했다.

## 현재 핵심 컴포넌트

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]]
- [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]]
- [[frontend/app/legacy/_components/Toast.tsx.md]]
- [[frontend/app/legacy/_components/legacyUi.ts.md]]

## 하위 허브

- [[frontend/app/legacy/_components/mobile/mobile]]
- [[frontend/app/legacy/_components/_archive/_archive]]

## 읽는 포인트

- 데스크톱 변경은 `Desktop*View.tsx` 쪽에서 찾는다.
- 모바일 변경은 이제 `mobile/` 아래의 `screens`, `primitives`, `io`, `hooks` 순으로 따라가야 한다.
- 공통 스타일/라벨 규칙은 `legacyUi.ts` 에 많이 모여 있다.

## 관련 문서

- [[frontend/app/legacy/legacy]]
- [[frontend/lib/api.ts.md]]
- [[_vault/guides/ERP_MOC]]

Up: [[frontend/app/legacy/legacy]]

