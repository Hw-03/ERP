# index.ts

## 이 파일은 뭐예요?
`_admin_primitives` 폴더의 배럴(barrel) 파일입니다. `AdminPageHeader`, `AdminKpiBar`, `AdminListPanel`, `AdminDetailCard`와 각 타입을 한 경로에서 일괄 re-export합니다.

## 언제 보나요?
- 어드민 섹션 컴포넌트에서 프리미티브를 `import { AdminListPanel } from "./_admin_primitives"` 형태로 가져올 때

## 중요한 내용
- 외부 노출 목록: `AdminPageHeader`, `AdminPageHeaderProps`, `AdminKpiBar`, `AdminKpiBarProps`, `AdminKpiItem`, `AdminListPanel`, `AdminListPanelProps`, `AdminDetailCard`, `AdminDetailCardProps`, `AdminDetailTab`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminPageHeader.tsx]] — 페이지 헤더
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminKpiBar.tsx]] — KPI 바
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminListPanel.tsx]] — 목록 패널
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailCard.tsx]] — 상세 카드
