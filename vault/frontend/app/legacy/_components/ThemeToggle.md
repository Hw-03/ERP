---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/ThemeToggle.tsx
tags: [vault, code-note, frontend, b-tier]
---

# ThemeToggle — 다크모드 토글

> [!summary] 역할
> light/dark 테마 전환. localStorage + 백엔드 저장.

## 1. 이 파일의 역할

theme 토글 버튼. operator.theme → localStorage → document.documentElement.classList로 다크모드 적용. toggle 시 api.updateCurrentOperatorTheme() fire-and-forget 호출로 백엔드 저장. expanded 플래그로 UI 확장 가능.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/ThemeToggle.tsx` ([[erp/frontend/app/legacy/_components/ThemeToggle.tsx|원본]])

## 3. 주요 import

- React: `useEffect`, `useState`
- Icons: `Moon`, `Sun` from lucide-react
- `api` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `useCurrentOperator`, `setCurrentOperator` from `./login/useCurrentOperator`

## 4. 어디서 쓰이는지

- 페이지 상단/사이드바 테마 버튼
- 부모: layout/sidebar

## 5. ⚠️ 위험 포인트

> [!warning] api.updateCurrentOperatorTheme() 실패 → 무시(fire-and-forget)
> localStorage와 backend 동기 필수

## 6. 수정 전 체크

- [ ] dark class 적용 대상 CSS 검증
- [ ] operator 없을 때 localStorage 우선 동작 확인
