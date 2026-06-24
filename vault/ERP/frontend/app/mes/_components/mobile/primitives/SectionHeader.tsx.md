# SectionHeader.tsx

## 이 파일은 뭐예요?
모바일 화면 내 섹션 제목과 선택적 부제·우측 액션을 표시하는 단순 헤더 컴포넌트입니다. 배경·테두리 없이 텍스트만으로 구성되어 있습니다.

## 언제 보나요?
- 스크롤 가능한 화면 내에서 여러 섹션을 제목으로 구분할 때
- 섹션 제목 우측에 "더보기" 버튼 등 액션을 함께 배치할 때

## 중요한 내용
- `SectionHeader({ title, subtitle?, right?, className? })` — `title`은 필수
- `subtitle`은 대문자+자간 1.2px 오버라인 스타일로 `title` 위에 표시
- `right`가 있으면 우측 끝에 고정 (`shrink-0`)
- 카드 박스 없이 텍스트+우측 슬롯만 있는 경량 헤더

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
