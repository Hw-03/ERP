# FilterChip.tsx

## 이 파일은 뭐예요?
필터 선택 상태를 시각적으로 표현하는 pill 형태의 토글 버튼입니다. active 여부에 따라 배경·테두리·글자 색이 바뀝니다.

## 언제 보나요?
- 목록 화면 상단의 필터 바에서 여러 옵션 중 하나를 ON/OFF할 때
- "전체 / 부서별 / 상태별" 같은 범주 필터를 구현할 때

## 중요한 내용
- `active` — true면 tone 색상, false면 muted2 색상으로 표시
- `tone` — 기본값 `LEGACY_COLORS.blue`; 다른 색도 전달 가능
- `size` — `"sm"` (`px-3 py-1`) | `"md"` (`px-4 py-2`)
- 내부적으로 `@/lib/ui/Button`의 `variant="ghost"` / `"secondary"`를 재사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/ui/Button.tsx]] — 기반 버튼 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
