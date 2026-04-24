---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/admin/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - admin
aliases:
  - 관리자 페이지 라우트
---

# app/admin/page.tsx

> [!summary] 역할
> `/admin` 경로 접속 시 루트(`/`)로 **리다이렉트**하는 라우트 파일.
> 실제 관리자 UI는 `DesktopLegacyShell` 의 admin 탭에서 렌더링된다.

> [!info] 코드 내용
> ```typescript
> import { redirect } from "next/navigation";
> export default function AdminPage() { redirect("/"); }
> ```
> 단 두 줄로, 모든 요청을 루트로 넘긴다.

---

## 쉬운 말로 설명

**`/admin` URL 로 들어오면 그냥 `/` 로 튕기는 리디렉션 파일**. 과거에 관리자 화면을 독립 페이지로 만들 계획으로 폴더만 만들어뒀다가, 현재는 레거시 Shell 내부의 "관리" 탭으로 통합됨.

## 접근 방법

- ❌ `/admin` → `/` 로 리다이렉트 → 자동으로 레거시 첫 화면
- ✅ 루트 `/` 접속 → 사이드바에서 "관리" 탭 선택 → `DesktopAdminView` 표시
- ✅ 모바일 → 하단 탭바에서 "관리" → `AdminTab`

## FAQ

**Q. URL 로 관리 화면 바로 열기?**
현재는 불가능. 필요하면 `DesktopLegacyShell` 이 쿼리스트링(`?tab=admin`) 받도록 개조 필요.

**Q. 이 파일을 삭제해도 되나?**
가능 — 그러나 폴더 통째로 지워야 함. 유지하는 이유는 차후 독립 관리자 화면 전환 대비.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] — 실제 관리자 UI
- [[frontend/app/legacy/_components/AdminTab.tsx.md]] — 모바일 관리 탭
- [[frontend/app/admin/admin]] — 라우트 폴더 인덱스

Up: [[frontend/app/app]]
