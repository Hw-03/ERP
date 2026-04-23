---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopSidebar.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - sidebar
aliases:
  - 사이드바
  - 탭 메뉴
---

# DesktopSidebar.tsx

> [!summary] 역할
> 데스크톱 UI의 좌측 사이드바. DEXCOWIN 로고와 탭 메뉴 버튼을 표시한다.

> [!info] 주요 책임
> - 회사 로고 이미지 표시 (`dexcowin-logo.png`)
> - 탭 메뉴 버튼 (inventory / warehouse / admin)
> - 현재 활성 탭 강조 표시
> - 탭 클릭 시 상위 컴포넌트로 탭 변경 이벤트 전달

> [!warning] 주의
> - 로고는 `frontend/public/dexcowin-logo.png` 사용
> - 흰색 로고 플레이트 위에 이미지 표시하는 방식

---

## 쉬운 말로 설명

**마우스 올리면 펼쳐지는 좌측 메뉴**. 기본 폭 72px(아이콘만), 호버 시 220px 로 확장되며 라벨과 서브타이틀 표시.

탭 4개: 대시보드 / 입출고 / 입출고 내역 / 관리. 클릭 시 `onTabChange(id)` 콜백.

---

## Props

```typescript
{
  activeTab: DesktopTabId;  // "inventory" | "warehouse" | "history" | "admin"
  onTabChange: (tab: DesktopTabId) => void;
}
```

---

## 탭 메타 (TABS 상수)

| id | label | subtitle |
|------|------|---------|
| `inventory` | 대시보드 | 현황과 안전재고 확인 |
| `warehouse` | 입출고 | 입고와 출고 작업 처리 |
| `history` | 입출고 내역 | 입출고 이력 조회 |
| `admin` | 관리 | 마스터와 운영 설정 |

---

## FAQ

**Q. 사이드바 고정 펼치기?**
`expanded` 상태를 `true` 로 초기화하고 `onMouseLeave` 제거.

**Q. 탭 라벨 바꾸려면?**
`TABS` 배열의 `label`/`subtitle` 만 수정. id는 Shell 과 연동되어 있으니 신중.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] — activeTab 상태 소유자
- [[frontend/app/legacy/_components/DesktopTopbar.tsx.md]]
- [[frontend/app/legacy/_components/legacyUi.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]
