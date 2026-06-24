# SidebarButton.tsx

## 이 파일은 뭐예요?
관리자 화면 사이드바의 개별 메뉴 버튼 컴포넌트입니다. 활성 여부(`active`)와 위험 여부(`danger`)에 따라 배경색·아이콘 색·왼쪽 액센트 바를 동적으로 변경합니다.

## 언제 보나요?
- `AdminSidebar`가 각 섹션 메뉴를 렌더할 때
- "보안" 섹션처럼 `danger=true`로 강조 표시가 필요한 항목을 렌더할 때

## 중요한 내용
- `SidebarButton({ entry, active, onClick, danger? })` — export 컴포넌트
- `SidebarEntry` 타입 — `id`, `label`, `description`, `icon: ElementType`
- `SidebarButtonProps` — `SidebarEntry`를 통째로 받아 아이콘·레이블·설명 렌더
- 왼쪽 3px 세로 액센트 바 — `active`일 때만 `opacity: 1`
- `danger=true` — 배경·테두리·아이콘 색을 `LEGACY_COLORS.red` 계열로 전환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSidebar.tsx]] — `SidebarButton`을 렌더하는 부모
