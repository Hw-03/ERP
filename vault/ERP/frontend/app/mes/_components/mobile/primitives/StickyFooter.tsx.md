# StickyFooter.tsx

## 이 파일은 뭐예요?
모바일 화면 하단에 고정되는 sticky 푸터 컨테이너입니다. 주 액션 버튼(PrimaryActionButton 등)을 화면 하단에 고정할 때 사용하며, iOS safe area(홈 인디케이터 영역)를 자동으로 고려합니다.

## 언제 보나요?
- 입출고 위저드, 결재 화면 등에서 "다음" / "제출" / "확정" 버튼을 화면 하단에 고정할 때
- 스크롤해도 항상 접근 가능한 주 액션이 필요할 때

## 중요한 내용
- `StickyFooter({ children, className?, flat? })` — `sticky bottom-0 z-30`
- `flat=false(기본)`: 상단 border + s1 배경 + 상단 그림자("0 -12px 24px rgba(0,0,0,.24)")
- `flat=true`: 배경·테두리·그림자 제거 — 버튼만 떠 보이는 효과 (항목 4-4B·4-10A)
- `paddingBottom: "calc(env(safe-area-inset-bottom, 12px) + 12px)"` — iOS 노치/홈바 대응
- `px-4 pt-3` 기본 내부 여백

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/PrimaryActionButton.tsx]] — 주요 자식 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
