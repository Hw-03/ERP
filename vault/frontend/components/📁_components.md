---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/components/
tags: [vault, index, folder-marker]
aliases:
  - "components"
  - "components.md"
---

# 📁 components

> [!summary] 역할
> Next.js 표준 `components/` 위치. 앱 상단 네비게이션과 두 개의 카드 컴포넌트만 존재. 실질적인 UI는 `app/legacy/_components/` 가 담당한다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/components/` 의 vault 미러.

## 어떤 파일들이 있나

- [[erp/frontend/components/AppHeader.tsx.md|AppHeader.tsx]] — 상단 네비게이션 바. 대시보드·품목 리스트·입출고·거래 이력·BOM/생산·관리자 6개 링크. `usePathname` 으로 활성 탭 표시.
- [[erp/frontend/components/CategoryCard.tsx.md|CategoryCard.tsx]] — `ProcessTypeSummary` 기반 공정 유형 배지 카드. `@/lib/api` 에서 타입 임포트.
- [[erp/frontend/components/UKAlert.tsx.md|UKAlert.tsx]] — 미확인 항목 알림 배너. count + dismiss 버튼.

## 도메인 컨텍스트

이 폴더는 Next.js 관례상 생성된 표준 위치이나, 실제 프로덕션 화면의 대부분은 `app/legacy/_components/` 가 렌더링한다.  
`AppHeader` 는 레거시 뷰가 아닌 Next.js 라우터 기반 페이지 (`/inventory`, `/history` 등) 에서 사용된다.

## ⚠️ 위험 포인트

- `AppHeader` 의 `NAV_ITEMS` href 와 실제 `app/` 하위 라우트가 일치하는지 정기적으로 확인 필요.
- 신규 공통 컴포넌트를 여기에 추가하기 전에 `app/legacy/_components/common/` 에 이미 있는지 확인.

## 관련 가이드

- [[erp/_vault/guides/frontend-structure]]
