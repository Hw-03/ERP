---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopTopbar.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - desktop
  - ui
aliases:
  - 데스크탑 상단 바
---

# DesktopTopbar.tsx

> [!summary] 역할
> 데스크탑 각 뷰 상단에 표시되는 **헤더 바** 컴포넌트.
> 현재 탭 이름, 아이콘, 마지막 갱신 시각, 새로고침 버튼, 테마 토글을 포함한다.

> [!info] 포함 요소
> - 탭 아이콘 + 제목 (`icon`, `title` prop)
> - 상태 텍스트 (`statusText` — 예: "마지막 갱신: 2분 전")
> - 새로고침 버튼 (`onRefresh` 콜백)
> - 테마 토글 버튼 (`ThemeToggle` 컴포넌트 삽입)
> - 둥근 카드 스타일 (`border-radius: 28px`)

## Props

| Prop | 설명 |
|------|------|
| `title` | 탭 제목 |
| `icon` | Lucide 아이콘 컴포넌트 |
| `onRefresh` | 새로고침 핸들러 |
| `statusText` | 상태 표시 텍스트 |

---

## 쉬운 말로 설명

**본문 위 가로 헤더바**. 현재 탭 이름/아이콘 + 상태 메시지 + 테마 토글 + 새로고침 버튼. 새로고침 누르면 Shell 의 `refreshNonce` 증가 → 본문 리마운트.

상태 표시칸은 xl 이상 화면(1280px+)에서만 보임 (`hidden ... xl:flex`).

---

## FAQ

**Q. 새로고침 버튼 동작?**
Shell 에서 전달된 `onRefresh` 호출 → `setRefreshNonce(n+1)` → 자식의 `key` 변경 → 전체 재마운트(SWR 캐시는 유지되지만 useEffect 초기화됨).

**Q. 상태 메시지 길면?**
`truncate` 적용. 넘치는 부분은 `...` 으로 잘림.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] — 전체 쉘 (Topbar 탑재)
- [[frontend/app/legacy/_components/ThemeToggle.tsx.md]] — 테마 토글 버튼
- [[frontend/app/legacy/_components/legacyUi.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]
