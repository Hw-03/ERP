---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/page.tsx
status: active
tags:
  - erp
  - frontend
  - legacy
  - route
  - entrypoint
aliases:
  - 레거시 페이지 진입점
  - 메인 화면
---

# legacy/page.tsx

> [!summary] 역할
> 현재 실제로 사용 중인 메인 화면의 진입점.
> 데스크톱/모바일 분기 처리 후 `DesktopLegacyShell` 또는 모바일 레이아웃을 렌더링한다.

> [!info] 주요 책임
> - 화면 크기 감지 (데스크톱/모바일 분기)
> - API 데이터 초기 로드 (재고 요약, 직원 목록 등)
> - `DesktopLegacyShell` 또는 `LegacyLayout` 렌더링

> [!warning] 주의
> - 루트 `page.tsx`가 이 파일을 re-export하므로, `/` 접속 시 이 파일이 렌더링됨
> - 수정 시 데스크톱과 모바일 양쪽 동작 모두 확인 필요

---

## 쉬운 말로 설명

**레거시 UI 전체의 시작점**. 루트 `page.tsx` 가 이걸 re-export 하므로 `/` 로 접속해도 결국 이 파일이 렌더링됨.

하는 일:
1. 화면 폭(`window.innerWidth`) 감지로 desktop/mobile 판단
2. API 초기 데이터 로드 (`listItems`, `listEmployees`, `getInventorySummary` 등)
3. desktop → `DesktopLegacyShell`, mobile → `LegacyLayout` 렌더

## 전형적 데이터 흐름

```
legacy/page.tsx (클라이언트 컴포넌트)
  │
  ├─ useEffect: 초기 API 배치 호출
  │   ├── api.listItems()         ← 전체 품목
  │   ├── api.listEmployees()     ← 직원 목록
  │   ├── api.getInventorySummary() ← 재고 요약
  │   └── api.listAlerts()        ← 알림
  │
  ├─ refreshNonce 상태 (강제 재조회 트리거)
  │
  └─ return <DesktopLegacyShell /> | <LegacyLayout />
```

- `refreshNonce` 가 1 증가할 때마다 전체 재조회 (Topbar 새로고침 버튼이 이걸 증가시킴)

## FAQ

**Q. SSR? CSR?**
`"use client"` 선언으로 클라이언트 컴포넌트. 초기 HTML 은 서버가 보내지만 데이터 페칭은 브라우저에서.

**Q. `/legacy` 와 `/` 차이?**
둘 다 이 파일. `/legacy` 가 원래 경로, `/` 는 편의상 같은 내용.

**Q. 데스크톱/모바일 분기 기준?**
`window.innerWidth >= 1024px` 이면 데스크톱. `md:` 같은 Tailwind breakpoint 와 일치시킨 상수.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] — 데스크톱 렌더러
- [[frontend/app/legacy/_components/LegacyLayout.tsx.md]] — 모바일 렌더러
- [[frontend/lib/api.ts.md]] — 초기 데이터 API
- [[frontend/app/page.tsx.md]] — re-export 상위

Up: [[frontend/app/legacy/legacy]]
