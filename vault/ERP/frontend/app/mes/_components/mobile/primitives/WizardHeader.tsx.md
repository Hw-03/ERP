# WizardHeader.tsx

## 이 파일은 뭐예요?
다단계 위저드 화면의 상단에 진행 상황(진행 바 + Step N/M + 현재 단계명)과 선택 요약 칩을 표시하는 헤더 컴포넌트입니다.

## 언제 보나요?
- 입출고 위저드처럼 여러 단계로 나뉜 작업 흐름의 각 단계 상단에 표시할 때
- 이전 단계 선택 내용을 칩으로 요약해 보여줄 때

## 중요한 내용
- `WizardHeader({ steps, current, chips?, className? })` — `steps`는 `{ key, label }[]`, `current`는 0-based 인덱스
- 상단에 단계별 가로 바(완료=파란색 88%, 현재=파란색, 미래=s3)로 진행률 시각화
- 우측에 현재 단계 라벨(파란색 caption), 좌측에 "Step N / M" 텍스트
- `chips`가 있으면 하단에 `SummaryChipBar`로 선택 요약 칩 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/SummaryChipBar.tsx]] — 요약 칩 표시 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
