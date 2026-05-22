---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/common/AppSelect.tsx
tags: [vault, code-note, c-tier]
---

# AppSelect — 커스텀 드롭다운 (option + disabled 지원)

> [!summary] 조건부 disabled, 3가지 크기(sm/md/lg), 초기값 제어 가능한 controlled select

## 1. 역할

AppSelectOption[] 으로부터 리스트 렌더. value + onChange 제어 상태. size별 padding/text. disabled 옵션 + aria-disabled.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/common/AppSelect.tsx` ([[erp/frontend/app/legacy/_components/common/AppSelect.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/common/EmptyState.tsx|EmptyState]]
- [[erp/frontend/app/legacy/_components/common/FilterChip.tsx|FilterChip]]
