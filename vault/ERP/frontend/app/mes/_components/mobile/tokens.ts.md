# tokens.ts

## 이 파일은 뭐예요?
모바일 컴포넌트 전체에서 공통으로 사용하는 Tailwind 클래스 조합 토큰 파일. 타이포그래피(`TYPO`)와 그림자(`ELEVATION`) 두 가지 상수를 export한다.

## 언제 보나요?
- 모바일 컴포넌트에서 글자 크기·굵기·행간 조합을 직접 작성하지 않고 토큰으로 참조할 때
- 모바일 UI의 타이포그래피 기준을 확인하거나 변경할 때

## 중요한 내용
- `TYPO` — 6종 타이포그래피 토큰
  - `overline`: `text-xs font-bold uppercase tracking-wider`
  - `headline`: `text-lg font-black leading-tight`
  - `title`: `text-base font-bold`
  - `body`: `text-sm font-medium`
  - `caption`: `text-xs font-regular`
  - `display`: `text-2xl font-black`
- `ELEVATION` — 그림자 토큰
  - `sticky`: `"0 2px 8px rgba(0,0,0,0.12)"` (헤더·하단 바 sticky 그림자)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — TYPO·ELEVATION 사용
- [[ERP/frontend/app/mes/_components/mobile/MobileUserMenuSheet.tsx]] — TYPO 사용
- [[ERP/frontend/lib/mes/color.ts]] — 색상 토큰(LEGACY_COLORS), 이 파일과 함께 사용됨
