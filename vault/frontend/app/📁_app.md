---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/
tags: [vault, index, folder-marker]
aliases:
  - "app"
  - "app.md"
---

# 📁 app

> [!summary] 역할
> Next.js 14 App Router 진입점. 실제 UI 로직은 `app/legacy/` 하위에 있고, 이 폴더는 라우팅 뼈대만 담는다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/` 의 vault 미러.

## 어떤 파일들이 있나

핵심 파일:
- `layout.tsx` — HTML 루트, metadata(`DEXCOWIN 재고 관리 시스템`), globals.css 임포트
- `page.tsx` — `export { default } from "./legacy/page"` 단 한 줄. 루트 `/` 를 legacy 에 위임
- `error.tsx` — App Router 에러 바운더리
- `global-error.tsx` — 최상위 에러 바운더리
- `globals.css` — 전역 Tailwind 기준 스타일

부수 폴더 — 라우트 stub (page.tsx 없이 폴더만 존재):
- `admin/`, `alerts/`, `bom/`, `counts/`, `history/`, `inventory/`, `operations/`, `queue/`
  이 라우트들은 현재 실제 페이지가 없다. 직접 접근 시 404 또는 legacy 로 대체.

## 도메인 컨텍스트

App Router 는 파일 기반 라우팅 추상화 역할만 수행한다. 모든 화면 렌더링은 `legacy/page.tsx`
→ `DepartmentsProvider` + `MesLoginGate` + `DesktopLegacyShell` / `MobileShell` 체인에서 이루어진다.

## ⚠️ 위험 포인트

- `app/page.tsx` 는 stub 이다 — 내용이 한 줄이라도 건드리면 라우팅 전체에 영향.
- stub 라우트(`admin/` 등)에 page.tsx 를 추가하면 legacy 와 중복 진입점이 생긴다.
- 실제 UI 는 `legacy/` 에 있다. 이름에 속지 말 것.

## 관련 가이드

- [[erp/_vault/guides/frontend-routing]]

## 자식 폴더

- [[erp/frontend/app/legacy/📁_legacy|legacy/]] — **실제 활성 UI** 진입점
- [[erp/frontend/app/admin/admin|admin/]] — stub
- [[erp/frontend/app/alerts/alerts|alerts/]] — stub
- [[erp/frontend/app/bom/bom|bom/]] — stub
- [[erp/frontend/app/counts/counts|counts/]] — stub
- [[erp/frontend/app/history/history|history/]] — stub
- [[erp/frontend/app/inventory/inventory|inventory/]] — stub
- [[erp/frontend/app/operations/operations|operations/]] — stub
- [[erp/frontend/app/queue/queue|queue/]] — stub
