---
type: code-note
project: ERP
layer: frontend
source_path: frontend/components/AppHeader.tsx
status: active
tags:
  - erp
  - frontend
  - component
aliases:
  - 앱 헤더
---

# AppHeader.tsx

> [!summary] 역할
> 앱 공통 헤더 컴포넌트. 페이지 제목과 네비게이션 요소를 표시한다.

---

## 쉬운 말로 설명

**앱 공통 상단 바**. 로고 + 제목 + (옵션) 뒤로가기 버튼. `legacy/_components/DesktopTopbar` 와 분리된 이유는 레거시 아닌 새 UI 라우트용 헤더라서.

현재 레거시 화면에서는 거의 안 씀. 일부 new-route 페이지에서만 사용.

## FAQ

**Q. 레거시 UI에도 붙일 수 있나?**
가능. 다만 디자인이 달라서 그냥 두는 게 일반적.

**Q. 알림/검색창 같은 확장?**
현재는 순수 제목만. 확장 필요하면 `children` prop 추가 고려.

---

## 관련 문서

- [[frontend/components/components]] — 공용 컴포넌트 목록
- [[frontend/app/legacy/_components/DesktopTopbar.tsx.md]] — 레거시 버전

Up: [[frontend/components/components]]
