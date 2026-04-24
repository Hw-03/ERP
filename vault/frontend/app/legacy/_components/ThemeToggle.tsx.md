---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/ThemeToggle.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - ui
  - theme
aliases:
  - 테마 토글
---

# ThemeToggle.tsx

> [!summary] 역할
> 다크 모드 ↔ 라이트 모드를 전환하는 **토글 버튼 컴포넌트**.
> `localStorage`에 선택된 테마를 저장하여 새로고침 후에도 유지된다.

> [!info] 동작 방식
> - 기본값: 다크 모드 (`html.dark`)
> - 라이트 전환 시: `document.documentElement.setAttribute("data-theme", "light")`
> - 아이콘: `Moon` (다크) / `Sun` (라이트) — Lucide 아이콘 사용
> - `globals.css`의 CSS 변수(--c-bg 등)가 `data-theme="light"` 속성에 따라 자동 전환

---

## 쉬운 말로 설명

**달↔해 아이콘 버튼**. 누르면 `<html data-theme="light">` 속성 on/off. CSS 변수가 자동 전환 → 전체 화면 색상 뒤집힘.

localStorage `theme` 키에 저장 → 새로고침 후에도 유지.

초기 상태:
- localStorage에 `"light"` 있으면 → 라이트 모드
- 그 외(null / "dark") → 다크 모드 (속성 없음 = 기본)

## FAQ

**Q. 시스템 다크모드 감지?**
현재 없음. `prefers-color-scheme` 미디어쿼리 감지 원하면 useEffect 에서 `matchMedia` 추가 필요.

**Q. 테마 변경 시 깜빡임(FOUC)?**
Next.js SSR 은 `html` 속성을 모르므로 초기 렌더는 항상 다크. 마운트 직후 localStorage 읽고 `data-theme="light"` 설정되며 한 번 깜빡일 수 있음. 개선 방법: `next-themes` 라이브러리 사용.

---

## 관련 문서

- [[frontend/app/globals.css.md]] — CSS 변수 정의
- [[frontend/app/legacy/_components/DesktopTopbar.tsx.md]] — Topbar에 삽입됨
- [[frontend/app/legacy/_components/legacyUi.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]
