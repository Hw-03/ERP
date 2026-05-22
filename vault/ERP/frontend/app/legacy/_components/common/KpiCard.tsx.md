---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/common/KpiCard.tsx
tags: [vault, code-note, c-tier]
---

# KpiCard — KPI 지표 카드 (tone별 배경 + 대값 표시)

> [!summary] label + value + hint. tone(컬러) 기반 color-mix 배경. compact 모드. 클릭/hover 상태

## 1. 역할

tone → tint() 배경 계산(8/16/22%). active/hover 시 진한 색. label/value/hint 3줄 표시. compact 축약.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/common/KpiCard.tsx` ([[erp/frontend/app/legacy/_components/common/KpiCard.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/common/FilterChip.tsx|FilterChip]]
- [[erp/frontend/app/legacy/_components/common/StatusPill.tsx|StatusPill]]
