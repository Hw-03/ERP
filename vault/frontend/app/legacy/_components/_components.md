---
type: index
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
aliases:
  - 레거시 컴포넌트 목록
---

# frontend/app/legacy/_components

> [!summary] 역할
> 레거시 UI를 구성하는 모든 화면 컴포넌트가 있는 폴더.
> 데스크톱 화면별 뷰, 사이드바, 모달, 모바일 탭 등이 모두 여기에 있다.

## 핵심 컴포넌트

| 파일 | 역할 |
|------|------|
| [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] | 데스크톱 전체 쉘 (탭 전환, 레이아웃) |
| [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] | 재고 현황 화면 |
| [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] | 입출고 작업 화면 |
| [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] | 관리자 화면 |
| [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]] | 거래 이력 화면 |
| [[frontend/app/legacy/_components/DesktopSidebar.tsx.md]] | 사이드바 (로고, 탭 메뉴) |
| [[frontend/app/legacy/_components/DesktopTopbar.tsx.md]] | 상단 바 |
| [[frontend/app/legacy/_components/DesktopRightPanel.tsx.md]] | 우측 패널 |
| [[frontend/app/legacy/_components/PinLock.tsx.md]] | 관리자 핀락 화면 |

## 모바일/공용 컴포넌트

| 파일 | 역할 |
|------|------|
| [[frontend/app/legacy/_components/LegacyLayout.tsx.md]] | 모바일 기본 레이아웃 |
| [[frontend/app/legacy/_components/InventoryTab.tsx.md]] | 모바일 재고 탭 |
| [[frontend/app/legacy/_components/HistoryTab.tsx.md]] | 모바일 이력 탭 |
| [[frontend/app/legacy/_components/WarehouseIOTab.tsx.md]] | 모바일 입출고 탭 |
| [[frontend/app/legacy/_components/AdminTab.tsx.md]] | 모바일 관리자 탭 |
| [[frontend/app/legacy/_components/DeptIOTab.tsx.md]] | 부서 입출고 탭 |
| [[frontend/app/legacy/_components/ItemDetailSheet.tsx.md]] | 품목 상세 바텀시트 |
| [[frontend/app/legacy/_components/AlertsBanner.tsx.md]] | 알림 배너 |
| [[frontend/app/legacy/_components/BarcodeScannerModal.tsx.md]] | 바코드 스캐너 모달 |
| [[frontend/app/legacy/_components/FilterPills.tsx.md]] | 필터 칩 컴포넌트 |
| [[frontend/app/legacy/_components/Toast.tsx.md]] | 토스트 알림 |
| [[frontend/app/legacy/_components/ThemeToggle.tsx.md]] | 다크/라이트 테마 토글 |
| [[frontend/app/legacy/_components/BottomSheet.tsx.md]] | 모바일 바텀시트 모달 |
| [[frontend/app/legacy/_components/SelectedItemsPanel.tsx.md]] | 선택 품목 목록 패널 |
| [[frontend/app/legacy/_components/legacyUi.ts.md]] | 색상 상수 + UI 유틸 함수 모음 |

---

## 쉬운 말로 설명

화면을 구성하는 **모든 UI 블록**. 큰 것은 전체 화면(`DesktopLegacyShell`), 작은 것은 버튼/토스트까지.

### 분류
1. **쉘/레이아웃** — 화면의 뼈대
2. **뷰(View)** — 탭별 메인 콘텐츠 영역
3. **패널/사이드바** — 보조 UI
4. **모달/시트** — 팝업
5. **작은 컴포넌트** — 토스트, 필터 칩, 토글 등

---

## 컴포넌트 계층 (데스크톱)

```
DesktopLegacyShell ⭐
├── DesktopSidebar (좌)
├── DesktopTopbar (상)
├── [activeTab 에 따라]
│   ├── DesktopInventoryView
│   ├── DesktopWarehouseView
│   ├── DesktopAdminView
│   │   └── PinLock (인증 전)
│   └── DesktopHistoryView
├── DesktopRightPanel (우)
└── BarcodeScannerModal (필요 시)
```

## 컴포넌트 계층 (모바일)

```
LegacyLayout
├── 상단 AppHeader + ThemeToggle
├── [activeTab 에 따라]
│   ├── InventoryTab
│   ├── WarehouseIOTab
│   ├── DeptIOTab
│   ├── HistoryTab
│   └── AdminTab
├── BottomSheet / ItemDetailSheet (필요 시)
├── Toast
└── AlertsBanner (상단 고정)
```

---

## 가장 자주 건드리는 컴포넌트

| 파일 | 수정 사유 |
|------|----------|
| [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] | 재고 표시 방식 변경 |
| [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] | 입출고 폼 변경 |
| [[frontend/app/legacy/_components/InventoryTab.tsx.md]] | 모바일 재고 UI 변경 |
| [[frontend/app/legacy/_components/legacyUi.ts.md]] | 색상·스타일 상수 |

---

## FAQ

**Q. 컴포넌트 하나 수정하면 어디 영향?**
해당 컴포넌트를 import 하는 상위 컴포넌트만 영향. `DesktopShell` 수정은 데스크톱 화면 전체 영향.

**Q. 상태는 어디서 관리?**
대부분 `legacy/page.tsx` 루트에서 `useState` 로. 컴포넌트로 props 전달. 전역 상태 라이브러리(Redux/Zustand) 없음.

**Q. 스타일은 인라인이 아니라 어디서?**
Tailwind className + `legacyUi.ts` 의 색상 상수 조합. CSS 파일 따로 없음(전역은 `globals.css`).

---

## 관련 문서

- [[frontend/app/legacy/legacy]] (상위)
- [[frontend/app/legacy/_components/legacyUi.ts.md]] — 공통 스타일
- [[frontend/lib/api.ts.md]] — 이 컴포넌트들이 부르는 API
- 재고 입출고 시나리오 — 컴포넌트 동작 예시

Up: [[frontend/app/legacy/legacy]]
