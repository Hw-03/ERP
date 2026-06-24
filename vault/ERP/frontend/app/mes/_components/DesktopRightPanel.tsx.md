# DesktopRightPanel.tsx

## 이 파일은 뭐예요?
데스크톱 화면 우측에 고정 폭(420px)으로 표시되는 슬라이드 패널 껍데기입니다. 제목·서브타이틀·배지·뒤로가기·닫기 버튼을 일관된 레이아웃으로 렌더링하고, 내용은 `children`으로 주입합니다.

## 언제 보나요?
- 품목 상세, 입출고 초안, 관리자 편집 등 오른쪽 패널이 열릴 때
- 우측 패널 헤더 레이아웃이나 닫기 버튼 동작을 수정할 때

## 중요한 내용
- `DesktopRightPanel({ title, subtitle?, headerBadge?, backButton?, onClose?, children })`
- 고정 너비 `w-[420px]`, 내부 스크롤 `scrollbar-hide overflow-y-auto`
- `onClose`가 없으면 X 버튼 미표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰
