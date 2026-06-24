---
type: folder-note
source_path: "frontend/app/mes"
importance: important
layer: frontend
graph: hub
updated: 2026-06-24
project: DEXCOWIN MES
---

# 📁 mes

## 이 폴더는 무엇을 위한 곳인가

현재 실제 운영 중인 MES 화면이 이 폴더에 있습니다. 브라우저에서 `/mes`로 접속하면 여기가 실행됩니다.

2026-06-05 이전에는 폴더 이름이 `legacy`였습니다. 개명 이후 이 `mes/`가 활성 운영 경로입니다. `legacy/`라는 이름은 코드에서 사라졌습니다.

## 언제 보면 좋나

- 화면 버튼이 어떤 컴포넌트로 연결되는지 찾을 때
- 데스크톱·모바일 UI를 각각 확인할 때
- 입출고 화면(`IoComposeView`, `MobileIoComposeWizard`)을 따라갈 때

## 주요 하위 폴더

- `_components/` — 화면을 구성하는 컴포넌트 전체. 데스크톱과 모바일을 의도적으로 분리.
  - `_warehouse_v2/` — 현재 활성 입출고 UI (`IoComposeView.tsx` 등)
  - `_warehouse_map_sections/` — 창고 지도 화면
  - `mobile/` — 모바일 전용 컴포넌트 (`MobileShell`, 마법사 흐름 등)
  - `common/` — 공용 UI 부품 (`EmptyState`, `LoadFailureCard`, `ConfirmModal` 등)
  - `_weekly_sections/` — 주간보고 화면 (동결: 2026-05-24, 명시 요청 없으면 손대지 않음)

## 주요 파일

- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 입출고 조합 UI 본체
- [[ERP/frontend/app/mes/_components/DesktopWarehouseMapView.tsx]] — 창고 지도 데스크톱 뷰 (2탭: 박스 관리·앵글 편집)
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 모바일 탭 네비게이션 (동결)
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx]] — 모바일 입출고 마법사

## 건드릴 때 조심할 점

- `_weekly_sections/` 와 `DesktopWeeklyReportView.tsx` 는 **동결 영역** — 명시 요청 없으면 수정 금지
- `MobileShell.tsx` 의 NavButton·`<nav>`·pill 스타일도 **동결** (2026-06-16)
- 데스크톱 컴포넌트와 모바일 컴포넌트는 **의도적 분리** — 통합 시도 전 ADR-0003 확인 필요

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 입출고 UI 핵심
- [[ERP/_attic/docs/adr/ADR-0003-mobile-reuses-desktop-v2.md]] — 모바일·데스크톱 분리 설계 결정

> [!info]- 더 연결된 파일
> - [[ERP/frontend/app/layout.tsx]] — App Router 루트 레이아웃
> - [[ERP/frontend/app/page.tsx]] — 루트 진입점 (→ `/mes` 리디렉트)
> - [[ERP/frontend/lib/api/]] — 프론트 API 클라이언트 (15 도메인 모듈)
