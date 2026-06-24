# AdminSidebar.tsx

## 이 파일은 뭐예요?
관리자 화면 좌측 사이드바 전체를 렌더링하는 컴포넌트입니다. 섹션 메뉴를 "기준 정보·구성 관리·시스템" 3그룹으로 나눠 `SidebarButton`으로 나열하고, 하단에 보안 메뉴와 관리자 잠금 버튼을 배치합니다.

## 언제 보나요?
- 관리자 화면(`DesktopAdminView`)이 렌더되는 동안 항상 표시

## 중요한 내용
- `AdminSidebar({ section, onSelect, onLock })` — export 컴포넌트
- `SECTIONS: SectionMeta[]` — export 상수, 7개 섹션(models·items·employees·departments·bom·export·audit) 메타데이터
- `SETTINGS_ENTRY: SectionMeta` — export 상수, "보안" 섹션 메타 (danger 스타일 전용)
- `SECTION_GROUPS` — 3그룹 분류 내부 상수
- `SectionMeta` 타입 — `AdminSection` id, label, description, icon
- `onLock` — 관리자 잠금 버튼 클릭 시 호출 (PIN 입력 화면으로 복귀)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/SidebarButton.tsx]] — 개별 버튼 컴포넌트
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminViewState.ts]] — `AdminSection` 타입 정의
- [[ERP/frontend/app/mes/_components/DesktopAdminView.tsx]] — AdminSidebar를 사용하는 부모
