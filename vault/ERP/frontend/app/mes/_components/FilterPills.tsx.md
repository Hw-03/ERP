# FilterPills.tsx

## 이 파일은 뭐예요?
가로 스크롤 가능한 필터 선택 pill 버튼 그룹입니다. 단일 선택 상태를 `value`/`onChange`로 제어하고, 활성 색상은 외부에서 주입할 수 있습니다.

## 언제 보나요?
- 재고·입출고·히스토리 화면에서 카테고리나 상태를 필터링하는 pill UI를 수정할 때

## 중요한 내용
- `FilterPills({ options, value, onChange, activeColor? })`
  - `options: { label: string; value: string }[]` — pill 목록
  - `value` — 현재 선택된 값
  - `activeColor` — 기본값 `LEGACY_COLORS.blue`; 선택 시 배경·테두리에 적용
- 호버 상태는 `hovered` state로 관리, CSS variable `--pill-hover-mix` 등으로 오버레이 강도 조정

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰
