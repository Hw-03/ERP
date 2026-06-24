# IconButton.tsx

## 이 파일은 뭐예요?
Lucide 아이콘 하나를 감싸는 모바일 전용 아이콘 버튼 컴포넌트입니다. ghost/solid/outline 3가지 variant, sm/md/lg 3가지 크기, 숫자 뱃지를 지원하며 WCAG 최소 터치 영역(44px)을 보장합니다.

## 언제 보나요?
- 헤더 우측의 닫기, 뒤로, 더보기 버튼 등 아이콘만 있는 액션 버튼이 필요할 때
- 알림 뱃지가 있는 아이콘 버튼이 필요할 때

## 중요한 내용
- `IconButton({ icon, label, onClick?, variant?, size?, color?, disabled?, badge?, type? })` — `forwardRef` 적용
- `variant`: `"ghost"(기본)` / `"solid"` / `"outline"`
- `size`: `"sm"(44×44, 아이콘 16)` / `"md"(44×44, 아이콘 20, 기본)` / `"lg"(48×48, 아이콘 22)`
- `badge` 숫자가 있으면 우상단에 빨간 뱃지 표시(99 초과 시 "99+")
- `aria-label={label}` + `title={label}` 접근성 지원

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/SheetHeader.tsx]] — `IconButton` 닫기 버튼 사용처
- [[ERP/frontend/app/mes/_components/mobile/primitives/SubScreenHeader.tsx]] — `IconButton` 뒤로가기 사용처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
