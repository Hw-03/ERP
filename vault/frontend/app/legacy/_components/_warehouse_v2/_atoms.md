---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/_atoms.tsx
tags: [vault, code-note, frontend, b-tier]
---

# _atoms — IO 마법사 기본 컴포넌트

> [!summary] 역할
> warehouse_v2 전용 micro-component: LabeledSelect, SettingLabel, WizardStepCard 등.

## 1. 이 파일의 역할

IO 마법사 UI의 원자적 컴포넌트 모음. 레이블 붙은 선택지(LabeledSelect), 섹션 제목(SettingLabel), 단계 카드(WizardStepCard) 등을 정의. 스타일 일관성 유지 및 재사용성 높음.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/_atoms.tsx` ([[erp/frontend/app/legacy/_components/_warehouse_v2/_atoms.tsx|원본]])

## 3. 주요 import

- React: `useEffect`, `useState`
- Icons: `Check`, `Pencil` from lucide-react
- UI: `AppSelect`, `AppSelectOption` from `../common/AppSelect`
- Style: `LEGACY_COLORS` from `@/lib/mes/color`

## 4. 어디서 쓰이는지

- IoWorkTypeStep, IoTargetPicker 등 각 step UI
- IoComposeView 전체에서 폼 요소 구성
- [[관련: _warehouse_v2 모든 step 컴포넌트]]

## 5. ⚠️ 위험 포인트

> [!warning] LEGACY_COLORS inline style 사용 — color 시스템 변경 시 일괄 수정 필요

## 6. 수정 전 체크

- [ ] AppSelect API 변경 시 LabeledSelect 호환성 점검
- [ ] 새 atom 추가 시 LEGACY_COLORS 일관성 확인
