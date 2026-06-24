# AdminPageHeader.tsx

## 이 파일은 뭐예요?
어드민 페이지 최상단에 아이콘·제목·설명·액션 버튼을 표시하는 헤더 컴포넌트입니다. `danger` 플래그를 켜면 아이콘과 제목이 빨간색으로 바뀌고 "위험 영역" 배지가 나타납니다.

## 언제 보나요?
- 부서 관리, 직원 관리, PIN 리셋 등 어드민 섹션 각 페이지 상단에서 페이지 제목을 표시할 때
- 데이터 초기화처럼 파괴적 기능 페이지에서 시각적 위험 경고를 줄 때(`danger={true}`)

## 중요한 내용
- `AdminPageHeaderProps` — `icon: ElementType`, `title: string`, `description?`, `actions?`, `danger?`
- `danger` 값에 따라 tone 색상이 `LEGACY_COLORS.red` ↔ `LEGACY_COLORS.blue` 전환
- `danger=true` 시 `<AlertTriangle>` 아이콘과 "위험 영역" 텍스트 배지 자동 렌더
- 아이콘 배경은 `color-mix(in srgb, tone 14%, transparent)` — 반투명 채색

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/index.ts]] — 외부 노출 진입점
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰 정의
