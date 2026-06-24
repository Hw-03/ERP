# WizardProgress.tsx

## 이 파일은 뭐예요?
다단계 위저드의 진행 상태를 단계별 바(bar)로 시각화하는 컴포넌트입니다. WizardHeader와 달리 뒤로가기 버튼과 함께 사용하는 경량 진행 표시 전용 컴포넌트로, 단계명은 표시하지 않고 "Step N/M"과 진행 바만 보여줍니다.

## 언제 보나요?
- SubScreenHeader 아래에 위저드 진행률을 표시할 때
- 헤더 내부에 진행 표시를 별도로 삽입할 때

## 중요한 내용
- `WizardProgress({ steps, current, className? })` — `steps`는 `{ key, label }[]`, `current`는 0-based 인덱스
- 현재 단계는 `h-[6px]` + 파란색 glow 링 강조, 완료=파란색(opacity 0.9), 미래=s3
- "Step N / M" 텍스트는 우측 정렬만 (좌측 뒤로 버튼과 겹치지 않도록 설계)
- WizardHeader와 차이: 단계명 텍스트 없음, 칩 없음, 뒤로가기 버튼과 배치 고려

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx]] — 단계명+칩 포함 대안 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
