# AdminDetailCard.tsx

## 이 파일은 뭐예요?
어드민 화면의 오른쪽 상세 영역을 감싸는 카드 컨테이너입니다. 제목·부제목·상태 배지·액션 버튼·탭·푸터 슬롯을 props로 받아 LEGACY_COLORS 테마로 렌더링합니다.

## 언제 보나요?
- 어드민 섹션(부서 관리, 직원 관리 등)에서 목록 항목을 선택했을 때 우측에 상세 정보를 표시할 때
- 상세 영역 안에 탭을 나눠 여러 정보(기본정보/BOM/내역 등)를 전환해서 보여줄 때

## 중요한 내용
- `AdminDetailTab` — `{ id: string; label: string }` 탭 정의 타입
- `AdminDetailCardProps` — `title`, `subtitle`, `status`, `actions`, `tabs`, `activeTab`, `onTabChange`, `footer` 슬롯은 선택적; `children: ReactNode`은 필수
- 탭이 있을 때 활성 탭 하단에 2.5px 파란색 언더라인(`LEGACY_COLORS.blue`) 표시
- `LEGACY_COLORS.s1` 배경 / `LEGACY_COLORS.border` 테두리로 테마 통일

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/index.ts]] — 이 컴포넌트의 외부 노출 진입점
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰 정의
