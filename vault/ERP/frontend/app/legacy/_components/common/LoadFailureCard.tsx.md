---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/common/LoadFailureCard.tsx
tags: [vault, code-note, c-tier]
---

# LoadFailureCard — 로드 실패 알림 + 재시도

> [!summary] 빨강 배경 경고 카드. prefix + message + 동기화/재시도 버튼. aria-alert role

## 1. 역할

color-mix(red 10%) 배경. 아이콘 + 메시지 + 우측 버튼. onRetry callback (기본값: reload).

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/common/LoadFailureCard.tsx` ([[erp/frontend/app/legacy/_components/common/LoadFailureCard.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/common/LoadingSkeleton.tsx|LoadingSkeleton]]
- [[erp/frontend/app/legacy/_components/common/ResultModal.tsx|ResultModal]]
