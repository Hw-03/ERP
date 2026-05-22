---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_warehouse_sections/WarehouseAccessDenied.tsx
tags: [vault, code-note, frontend, b-tier]
---

# WarehouseAccessDenied — 입출고 권한 차단

> [!summary] 역할
> 입출고 작업 권한이 없는 부서 사용자 차단 카드.

## 1. 이 파일의 역할

AS, 연구, 영업 등 입출고 권한 없는 직원이 진입했을 때 표시. 부서명 표시하고 재고 조회·관리자 탭 안내.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_warehouse_sections/WarehouseAccessDenied.tsx` ([[erp/frontend/app/legacy\_components\_warehouse_sections/WarehouseAccessDenied.tsx|원본]])

## 3. 주요 import

- `LEGACY_COLORS` from `@/lib/mes/color`

## 4. 어디서 쓰이는지

- DesktopWarehouseView에서 권한 체크 실패 시 조건부 렌더
- 부모: 입출고 페이지 진입로

## 5. ⚠️ 위험 포인트

> [!warning] department 값 정규화 필수 — null/undefined 체크

## 6. 수정 전 체크

- [ ] 권한 검증 로직 (누가 권한 체크?) 일관성 확인
- [ ] 안내 메시지 업데이트 필요 시 텍스트 수정
