# SheetHeader.tsx

## 이 파일은 뭐예요?
모바일 바텀시트(bottom sheet) 상단 헤더 영역 컴포넌트입니다. 제목·부제·닫기 버튼·우측 액션 슬롯을 포함하며, 바텀시트가 열릴 때 최상단에 표시됩니다.

## 언제 보나요?
- 바텀시트가 열릴 때 시트의 최상단 타이틀바로 사용
- "닫기(X)" 버튼이 포함된 시트 헤더가 필요할 때

## 중요한 내용
- `SheetHeader({ title, subtitle?, onClose?, rightAction?, className? })` — `onClose`가 있으면 `IconButton`으로 X 버튼 렌더링
- 제목은 `TYPO.title font-black`, 부제는 `TYPO.caption` 스타일
- `px-5 pb-3 pt-2` 여백으로 시트 상단과 맞춤
- `rightAction`과 닫기 버튼이 함께 있을 때 `gap-1`로 나란히 배치

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/IconButton.tsx]] — 닫기 버튼 컴포넌트
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
