---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/layout.tsx
status: active
tags:
  - erp
  - frontend
  - layout
aliases:
  - 앱 레이아웃
  - 루트 레이아웃
---

# layout.tsx

> [!summary] 역할
> Next.js 앱 전체에 적용되는 루트 레이아웃. HTML 기본 구조, 메타데이터, 전역 스타일을 설정한다.

> [!info] 주요 책임
> - 페이지 타이틀: `X-Ray ERP | 재고 관리 시스템`
> - 다크 모드 기본 설정 (`html.dark`, `bg-slate-950`)
> - 한국어 페이지 설정 (`lang="ko"`)
> - `globals.css` 적용

> [!warning] 주의
> - 모든 페이지가 이 레이아웃 안에서 렌더링됨
> - 다크 모드가 기본값이므로 UI 작업 시 라이트 모드 확인 필요

---

## 쉬운 말로 설명

**모든 페이지를 감싸는 최외곽 HTML 템플릿**. Next.js App Router 는 이 파일이 반드시 존재해야 하고, 모든 `page.tsx` 는 자동으로 이 `layout.tsx` 안에 들어감.

예: `/inventory` 로 접속 → `layout.tsx` 의 `<html><body>` → 그 안에 `inventory/page.tsx` 내용 삽입.

## 핵심 코드 요소

```tsx
<html lang="ko" className="dark">
  <body className="bg-slate-950 text-slate-100 antialiased">
    {children}
  </body>
</html>
```

- `lang="ko"` — 검색엔진/스크린리더 힌트
- `className="dark"` — Tailwind 다크모드 클래스 (초기 깜빡임 방지)
- `bg-slate-950` — 초기 페인트 배경색 (CSS 변수 로딩 전 폴백)

## FAQ

**Q. 페이지별 타이틀 다르게?**
각 `page.tsx` 에 `export const metadata = {title: "..."}` 추가하면 `layout.tsx` 타이틀 덮어씀.

**Q. 폰트 바꾸려면?**
`next/font` 로 `Inter` 같은 폰트 로드해서 `body className` 에 추가. 현재는 시스템 폰트.

**Q. 전역 Provider 추가?**
(예: ReactQueryProvider, ThemeProvider) 여기 `<body>` 안에 클라이언트 컴포넌트로 감쌈.

---

## 관련 문서

- [[frontend/app/page.tsx.md]] — 루트 페이지 (legacy re-export)
- [[frontend/app/legacy/legacy]]
- [[frontend/app/globals.css.md]] — 전역 스타일

Up: [[frontend/app/app]]
