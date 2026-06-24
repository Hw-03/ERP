# _atoms.tsx

## 이 파일은 뭐예요?
`_warehouse_v2` 폴더 내부에서만 공유하는 소형 UI 원소(atom) 모음입니다. `LabeledSelect`(레이블이 붙은 드롭다운), `SettingLabel`(섹션 제목 텍스트), `WizardStepCard`(위저드 단계 카드 — active/complete/locked 3상태)를 제공합니다.

## 언제 보나요?
- 위저드 각 단계 카드(WizardStepCard)의 모양을 바꾸거나 상태를 추가할 때
- 피커 영역의 필터 드롭다운(LabeledSelect)을 수정할 때
- 섹션 레이블 스타일(SettingLabel)을 통일하고 싶을 때

## 중요한 내용
- `WizardStepCard` — `state: "active" | "complete" | "locked"` / `fill` prop으로 세로 남은 공간 전부 점유 가능 / 마운트 직후 requestAnimationFrame으로 fade-in 애니메이션
- `LabeledSelect` — `AppSelect`를 `label` + tiny uppercase 레이블로 감싼 래퍼
- `SettingLabel` — 섹션 구분용 uppercase bold 텍스트 컴포넌트

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — WizardStepCard를 실제로 배치해 단계별 상태를 제어하는 최상위 컴포넌트
- [[ERP/frontend/app/mes/_components/common/AppSelect.tsx]] — LabeledSelect 내부에서 사용하는 드롭다운 기반 컴포넌트
