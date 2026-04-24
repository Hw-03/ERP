---
type: code-note
project: ERP
layer: frontend
source_path: frontend/tailwind.config.ts
status: active
tags:
  - erp
  - frontend
  - styles
  - tailwind
  - config
aliases:
  - Tailwind 설정
---

# tailwind.config.ts

> [!summary] 역할
> Tailwind CSS의 커스텀 색상, 폰트 등을 정의하는 설정 파일.

> [!info] 주요 설정
> - **content**: `pages/`, `components/`, `app/` 하위 모든 ts/tsx/mdx 파일 포함
> - **커스텀 색상** (`brand`): 50~950 단계 파란색 계열 (X-ray ERP 산업용 테마)
> - **폰트**:
>   - sans: `Inter`, `system-ui`
>   - mono: `JetBrains Mono`, `Fira Code`

---

## 쉬운 말로 설명

**Tailwind CSS 에 "우리 프로젝트 전용 색상/폰트" 를 추가하는 설정**. 기본 Tailwind 는 `blue-500` 같은 색만 있는데, 여기서 `brand-600` 같은 커스텀 색 추가 가능.

현재 설정은 비교적 기본. 색상은 대부분 `globals.css` 의 CSS 변수로 관리 → Tailwind 는 구조·레이아웃 담당.

## FAQ

**Q. 새 색상 추가?**
`theme.extend.colors` 에 `{ myColor: "#ff00ff" }` 추가 → `className="bg-myColor"` 사용 가능.

**Q. content 경로 중요도?**
Tailwind 는 여기 지정된 파일만 스캔해서 사용된 클래스만 빌드. 경로 누락 시 스타일 미적용.

---

## 관련 문서

- [[frontend/app/globals.css.md]] — CSS 변수 정의 (Tailwind 레이어와 함께 사용)
- [[frontend/postcss.config.js.md]] — PostCSS 설정

Up: [[frontend/frontend]]
