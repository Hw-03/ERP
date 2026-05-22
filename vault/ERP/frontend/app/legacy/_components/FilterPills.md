---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/FilterPills.tsx
tags: [vault, code-note, frontend, b-tier]
---

# FilterPills — 필터 약정 전환 버튼

> [!summary] 역할
> 옵션 배열 → 약정 버튼 그룹. 활성/hover 스타일. 가로 스크롤 가능.

## 1. 이 파일의 역할

다중 선택 필터를 약정(pills) 버튼으로 표시. active 상태에서 activeColor 배경, hover 시 color-mix 반투명. hovered state로 mouse 위치 추적. options 배열 매핑, onChange 콜백으로 선택 값 전달.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/FilterPills.tsx` ([[erp/frontend/app/legacy/_components/FilterPills.tsx|원본]])

## 3. 주요 import

- React: `useState`
- `LEGACY_COLORS` from `@/lib/mes/color`

## 4. 어디서 쓰이는지

- 필터 옵션 전환 UI 여러 곳
- 부모: 필터 탭/보기 전환

## 5. ⚠️ 위험 포인트

> [!warning] activeColor 기본값 → 커스터마이즈 가능
> 가로 스크롤 가능 — mobile 반응형 확인

## 6. 수정 전 체크

- [ ] options 배열 순서 → 렌더 순서 결정
- [ ] activeColor prop 전달 후 스타일 검증
