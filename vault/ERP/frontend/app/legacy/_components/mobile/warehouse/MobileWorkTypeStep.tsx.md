---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/warehouse/MobileWorkTypeStep.tsx
tags: [vault, code-note, c-tier]
---

# MobileWorkTypeStep — 모바일 Step1/2 (작업유형 + 부타입 선택)

> [!summary] 393px 에서 1열 카드 리스트: IoWorkType 권한 필터 + 부서 visibility. Step2는 IoSubType 택.

## 1. 역할

canSeeWorkType/deptVisibility/requiresDepartments 로직 재사용. 1열 카드(데스크탑은 4열).

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/mobile/warehouse/MobileWorkTypeStep.tsx` ([[erp/frontend/app/legacy/_components/mobile/warehouse/MobileWorkTypeStep.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx|MobileIoComposeWizard (부모)]]
