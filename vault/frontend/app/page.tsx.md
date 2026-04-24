---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
aliases:
  - 루트 페이지
---

# page.tsx (루트)

> [!summary] 역할
> 앱의 루트 경로(`/`)에 해당하는 페이지. 단 한 줄로 `legacy/page.tsx`의 기본 export를 그대로 re-export한다.

> [!info] 주요 책임
> - `export { default } from "./legacy/page"` — 실제 내용 없음
> - 루트 접속 시 Legacy UI가 바로 렌더링됨

> [!warning] 주의
> - 이 파일을 수정해도 실제 UI는 바뀌지 않는다. 실제 구현은 `legacy/page.tsx`에 있다.

---

## 쉬운 말로 설명

**루트 경로(`/`) 의 "리디렉션" 파일**. 내용은 단 한 줄:
```tsx
export { default } from "./legacy/page";
```

Next.js 는 `/` 로 들어오면 이 파일을 렌더링 → 그 안에서 다시 `legacy/page` 를 그대로 내보냄 → 결국 사용자는 레거시 UI 를 보게 됨.

## 이런 구조인 이유

- 과거에는 `/` 에 새 UI, `/legacy` 에 레거시 UI 로 분리하는 계획이었음
- 현재는 새 UI 개발 중단, 레거시가 주력이라 **루트 경로를 레거시에 직결**
- 나중에 새 UI 완성되면 이 파일 내용을 `new-ui/page` 로 바꾸기만 하면 교체 가능

## FAQ

**Q. 여기 UI 고치면 왜 반영 안 됨?**
실제 렌더링 내용은 `legacy/page.tsx` 에 있음. 거기를 고쳐야 됨.

**Q. 루트로 접근 시 `/legacy` 로 URL 바꾸고 싶음?**
`redirect("/legacy")` 로 변경 가능. 단 브라우저 URL 이 변하고 북마크 깨짐 주의.

---

## 관련 문서

- [[frontend/app/legacy/page.tsx.md]] — 실제 렌더 위치
- [[frontend/app/layout.tsx.md]]

Up: [[frontend/app/app]]
