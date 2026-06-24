# Stepper.tsx

## 이 파일은 뭐예요?
수량을 ±1 또는 ±bigStep 단위로 조절하는 모바일 숫자 입력 컴포넌트입니다. 좌우 감소/증가 버튼과 직접 입력 필드를 가로로 배치하며, `min`/`max` 범위 클램핑을 내장합니다.

## 언제 보나요?
- 입출고 위저드에서 수량을 입력할 때
- 재고 조정 화면에서 수량을 빠르게 늘리고 줄일 때

## 중요한 내용
- `Stepper({ value, onChange, min?, max?, step?, bigStep?, danger?, className? })`
- `step` 기본값 1 (±1 버튼), `bigStep` 기본값 10 (±10 버튼)
- `min`/`max` 클램핑 내장 (`clamp` 함수)
- `danger=true`이면 수치 텍스트가 `LEGACY_COLORS.red` 로 표시
- 직접 숫자 입력도 가능 (`inputMode="numeric"`)
- 모든 버튼 최소 터치 영역 44px 보장

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
