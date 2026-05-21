---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/ItemDetailActionForm.tsx
tags: [vault, code-note, frontend, b-tier]
---

# ItemDetailActionForm — 품목 수량 조정 폼

> [!summary] 역할
> ADJUST/RECEIVE 모드 선택 + 수량 입력 + 메모 + 제출.

## 1. 이 파일의 역할

ItemDetailSheet의 액션 폼. mode(ADJUST/RECEIVE) 토글, 수량 입력(qty), 메모 필드, bump(델타) ± 버튼. saving 로딩 플래그, error 메시지, onSubmit 콜백.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/ItemDetailActionForm.tsx` ([[erp/frontend/app/legacy/_components/ItemDetailActionForm.tsx|원본]])

## 3. 주요 import

- `LEGACY_COLORS` from `@/lib/mes/color`

## 4. 어디서 쓰이는지

- ItemDetailSheet에서 tab="summary" 시 렌더
- 부모: 재고 조정 form

## 5. ⚠️ 위험 포인트

> [!warning] mode 선택 시 qty 초기화 여부 확인 필수
> bump(±버튼) 콜백 — qty 증감 처리

## 6. 수정 전 체크

- [ ] ItemDetailActionMode enum 확장 시 토글 버튼 갱신
- [ ] 수량 validation (음수 방지 등)
