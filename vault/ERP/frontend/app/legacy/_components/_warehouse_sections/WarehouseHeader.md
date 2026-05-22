---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseHeader.tsx
tags: [vault, code-note, frontend, b-tier]
---

# WarehouseHeader — 입출고 섹션 상단 에러 표시

> [!summary] 역할
> 입출고 페이지 상단 에러 메시지 조건부 표시(선택적).

## 1. 이 파일의 역할

입출고 섹션 헤더. loadFailure 메시지가 있으면 LoadFailureCard 표시, 없으면 null 반환. 간단한 에러 제시용.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseHeader.tsx` ([[erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseHeader.tsx|원본]])

## 3. 주요 import

- `LoadFailureCard` from `../common/LoadFailureCard`

## 4. 어디서 쓰이는지

- DesktopWarehouseView 페이지 상단
- 부서별 권한 오류, API 로드 실패 시 메시지 전달

## 5. ⚠️ 위험 포인트

> [!warning] null 반환 시 페이지 레이아웃 위치 변동 없음 — 의도된 설계

## 6. 수정 전 체크

- [ ] LoadFailureCard 텍스트 길이 증가 시 UI layout shift 검증
