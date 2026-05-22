---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/common/ResultModal.tsx
tags: [vault, code-note, c-tier]
---

# ResultModal — 결과 모달 (success/partial/fail)

> [!summary] kind별 아이콘(체크원/경고). successCount + failures 리스트. 액션 버튼. focus trap

## 1. 역할

success → 초록체크, partial → 경고삼각, fail → 빨강경고. failures[] 표시. primaryAction 슬롯(tone별 버튼색).

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/common/ResultModal.tsx` ([[erp/frontend/app/legacy/_components/common/ResultModal.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/common/LoadFailureCard.tsx|LoadFailureCard]]
- [[erp/frontend/app/legacy/_components/common/StatusPill.tsx|StatusPill]]
