---
type: code-note
project: ERP
layer: frontend
source_path: frontend/postcss.config.js
status: active
tags:
  - erp
  - frontend
  - styles
  - config
aliases:
  - PostCSS 설정
---

# postcss.config.js

> [!summary] 역할
> CSS 변환 파이프라인을 정의하는 PostCSS 설정 파일.
> Tailwind CSS와 autoprefixer를 플러그인으로 등록한다.

> [!info] 포함 플러그인
> - `tailwindcss` — Tailwind CSS 처리
> - `autoprefixer` — 브라우저 호환 CSS 접두사 자동 추가

---

## 쉬운 말로 설명

**CSS 전처리 파이프라인 정의**. Next.js 빌드 시 모든 CSS 파일이 이 파이프라인을 통과 → Tailwind 클래스를 실제 CSS 로 변환 + 브라우저별 접두사(`-webkit-`) 자동 추가.

건드릴 일 거의 없음. Tailwind 기본 구성에 포함되어 있음.

## FAQ

**Q. 추가 플러그인 넣고 싶다면?**
예: `cssnano` (최적화), `postcss-nested` (중첩 문법). `plugins` 객체에 추가하면 됨.

**Q. 빌드 속도 느림?**
`tailwindcss` 가 content scan 하는 시간. `content` 경로 최소화로 개선.

---

## 관련 문서

- [[frontend/tailwind.config.ts.md]] — Tailwind 상세 설정

Up: [[frontend/frontend]]
