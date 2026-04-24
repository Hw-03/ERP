---
type: index
project: ERP
layer: frontend
status: active
tags:
  - erp
  - frontend
aliases:
  - 프론트엔드 폴더
---

# frontend

> [!summary] 역할
> Next.js 기반 사용자 화면 전체를 담는 폴더.
> 이번 브랜치에서는 기존 데스크톱 레거시 UI 위에 모바일 전용 구조가 크게 확장됐다.

## 핵심 문서

- [[frontend/app/app]] - 라우트 페이지 허브
- [[frontend/app/legacy/legacy]] - 현재 실제 동작 UI
- [[frontend/app/legacy/_components/_components]] - 레거시 컴포넌트 허브
- [[frontend/app/legacy/_components/mobile/mobile]] - 모바일 전용 허브
- [[frontend/lib/api.ts.md]] - 프론트와 백엔드 사이의 API 클라이언트

## 이번 브랜치에서 눈여겨볼 변경

- `frontend/app/legacy/page.tsx` 가 데스크톱 + 모바일 쉘을 함께 조합하는 진입점으로 정리됐다.
- `frontend/app/legacy/_components/mobile/` 아래에 `hooks`, `io`, `primitives`, `screens` 구조가 새로 들어왔다.
- 이전 모바일 탭 파일 일부는 `_components/_archive/` 로 이동해 보존되고, 현재 흐름은 wizard 기반 모바일 화면으로 재편됐다.
- `DesktopAdminView`, `DesktopHistoryView`, `DesktopInventoryView`, `DesktopWarehouseView` 가 크게 확장돼 관리자/이력/재고/입출고 흐름이 더 세분화됐다.

## 읽는 순서

1. [[frontend/app/legacy/legacy]]
2. [[frontend/app/legacy/page.tsx.md]]
3. [[frontend/app/legacy/_components/_components]]
4. [[frontend/app/legacy/_components/mobile/mobile]]
5. [[frontend/lib/api.ts.md]]

## 관련 문서

- [[backend/backend]]
- [[_vault/guides/ERP_MOC]]
- [[_vault/guides/처음_읽는_사람]]

Up: [[ERP]]

