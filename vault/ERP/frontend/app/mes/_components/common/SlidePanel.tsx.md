# SlidePanel.tsx

## 이 파일은 뭐예요?
화면 우측에서 슬라이드로 열리고 닫히는 사이드 패널 컴포넌트입니다. 너비 애니메이션(160ms)과 콘텐츠 페이드+슬라이드(260ms)를 조합하며, open=false 시 width: 0으로 완전히 접힙니다.

## 언제 보나요?
- 목록 화면에서 항목을 클릭하면 오른쪽에 상세 정보가 펼쳐질 때
- 데스크톱 레이아웃에서 마스터-디테일 패턴을 구현할 때

## 중요한 내용
- `open` — true/false로 열림 여부 제어
- `width` — 기본값 436px; 숫자로 픽셀 지정
- `onClose` — 제공 시 X 버튼·ESC 키·포커스 트랩·aria dialog 활성화; 없으면 단순 region
- `hideCloseButton` — true면 X 버튼 숨김 (카드 내부에서 직접 닫기 버튼을 제공할 때)
- `useFocusTrap` — `@/lib/mes/useFocusTrap` 경로로 import (ResultModal과 import 경로 다름에 주의)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/useFocusTrap.ts]] — 포커스 트랩 훅
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
