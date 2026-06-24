# SectionCard.tsx

## 이 파일은 뭐예요?
모바일 화면에서 관련 콘텐츠를 하나의 카드 영역으로 묶는 컨테이너 컴포넌트입니다. 선택적 타이틀·부제·우측 액션 헤더와 패딩 옵션을 제공하며, `SectionCardRow`를 함께 제공해 레이블-값 쌍을 나열하는 데 사용합니다.

## 언제 보나요?
- 상세 화면에서 정보를 그룹별 카드로 구분할 때 (예: 품목 정보, 결재 정보, 재고 현황)
- 레이블-값 쌍으로 구성된 요약 정보를 깔끔하게 표시할 때

## 중요한 내용
- `SectionCard({ title?, subtitle?, action?, children, padding?, className? })` — `padding`은 `"none"/"sm"/"md"(기본)`
- `SectionCardRow({ label, value, valueColor?, className? })` — 레이블(muted 캡션) + 값(굵은 body) 좌우 정렬 행
- 헤더(`title` 또는 `action`)가 있으면 하단 경계선 포함 헤더 영역 렌더링
- `overflow-hidden rounded-[20px] border` 로 카드 외곽 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
