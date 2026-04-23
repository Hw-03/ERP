---
type: index
project: ERP
layer: frontend
source_path: frontend/app/
status: active
tags:
  - erp
  - frontend
  - route
aliases:
  - 앱 라우트
---

# frontend/app

> [!summary] 역할
> Next.js App Router의 라우트 폴더. URL 경로별로 page.tsx가 위치한다.

> [!warning] 주의
> - 루트 `page.tsx`는 `legacy/page.tsx`로 리다이렉트하는 단 한 줄짜리 파일이다.
> - 실제 UI는 `legacy/` 폴더 안에 있다.
> - `inventory/`, `admin/`, `bom/` 등의 page.tsx는 새 UI 전환 작업의 일부일 수 있음.

## 하위 문서

| 경로 | 설명 |
|------|------|
| [[frontend/app/page.tsx.md]] | 루트 (`/`) — legacy로 리다이렉트 |
| [[frontend/app/layout.tsx.md]] | 전체 앱 레이아웃 |
| [[frontend/app/legacy/legacy]] | 현재 활성 메인 UI |
| [[frontend/app/inventory/inventory]] | `/inventory` 페이지 |
| [[frontend/app/admin/admin]] | `/admin` 페이지 |
| [[frontend/app/bom/bom]] | `/bom` 페이지 |
| [[frontend/app/alerts/alerts]] | `/alerts` 페이지 |
| [[frontend/app/counts/counts]] | `/counts` 페이지 |
| [[frontend/app/history/history]] | `/history` 페이지 |
| [[frontend/app/operations/operations]] | `/operations` 페이지 |
| [[frontend/app/queue/queue]] | `/queue` 페이지 |

---

## 쉬운 말로 설명

이 폴더는 Next.js의 "라우트" 폴더다. **폴더 이름 = URL 경로**.
- `app/page.tsx` → `/` (루트)
- `app/admin/page.tsx` → `/admin`
- `app/legacy/page.tsx` → `/legacy`

각 URL에 해당하는 `page.tsx` 파일이 화면을 그린다.

---

## 두 종류의 페이지 구분

### 실제 활성 페이지 (legacy)
- [[frontend/app/legacy/legacy]] ⭐
- 사용자가 실제로 보는 UI 전부

### 준비 중/대체 페이지 (admin, inventory, bom 등)
- 일부는 새 UI 전환용 실험
- 일부는 직접 접속용 (`/admin` 등)
- **확인 방법**: 각 page.tsx 열어보고 실제 렌더링 컴포넌트 확인

---

## page.tsx 파일 구조

```tsx
export default function Page() {
  return <SomeComponent />
}
```

라우트마다 `page.tsx` 기본 구조는 위처럼 단순. 실제 로직은 `_components/` 나 `legacy/_components/` 의 컴포넌트에서.

---

## FAQ

**Q. 루트(/)로 접속하면 뭐가 뜨나?**
`app/page.tsx` → `legacy/page.tsx` 로 리다이렉트 → 레거시 UI 표시.

**Q. 새 URL 추가하려면?**
`app/새경로/page.tsx` 만들고 export default 함수로 컴포넌트 반환.

**Q. `_components/` 앞의 밑줄은 뭐?**
Next.js 규칙: `_` 로 시작하는 폴더는 **라우트로 취급 안 함**. 순수 내부 컴포넌트만 담는 용도.

---

## 관련 문서

- [[frontend/frontend]] (상위)
- [[frontend/app/legacy/legacy]] ⭐
- [[frontend/lib/api.ts.md]]
- 품목 등록 시나리오

Up: [[frontend/frontend]]
