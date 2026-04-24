---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/LegacyLayout.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - mobile
aliases:
  - 모바일 레이아웃
---

# LegacyLayout.tsx

> [!summary] 역할
> 모바일 환경에서 사용하는 기본 레이아웃. 하단 탭 바 기반의 모바일 UX를 제공한다.

> [!info] 주요 책임
> - 하단 탭 바 렌더링 (재고 / 입출고 / 이력 / 관리)
> - 탭별 컨텐츠 전환
> - 모바일 헤더 표시

---

## 쉬운 말로 설명

**모바일 전용 껍데기 컴포넌트**. 데스크톱용 `DesktopLegacyShell` 의 모바일 버전. 폰 화면 맞춰 상단 헤더 + 하단 탭바 구조로 배치.

PC 해상도(>=1024px) 는 `DesktopLegacyShell`, 모바일은 `LegacyLayout` 이 활성화되도록 `legacy/page.tsx` 에서 분기.

## 구조

```
┌────────────────────────┐
│  헤더 (제목 + 알림 배지)  │
├────────────────────────┤
│                        │
│    탭별 메인 콘텐츠      │
│  (InventoryTab 등)     │
│                        │
├────────────────────────┤
│  [재고][입출고][이력][관리]│  ← 하단 탭바
└────────────────────────┘
```

## 탭 구성

| 탭 | 컴포넌트 | 설명 |
|----|---------|------|
| 재고 | `InventoryTab` | 품목 목록 + 검색 + 필터 |
| 입출고 | `WarehouseIOTab` / `DeptIOTab` | 창고↔부서 입출고 |
| 이력 | `HistoryTab` | 최근 거래 기록 |
| 관리 | `AdminTab` | 설정, 엑셀 내보내기 |

## FAQ

**Q. PC에서 강제로 모바일 레이아웃?**
`legacy/page.tsx` 에서 뷰포트 감지 로직 수정 필요. 일반적으로는 모바일 기기만 이걸 씀.

**Q. 탭 추가?**
`LegacyLayout` + 해당 탭 컴포넌트 만들고 하단 탭바 버튼 추가. 모바일은 화면 폭 때문에 5개 이상은 비추.

**Q. 스와이프로 탭 전환?**
현재 없음. 버튼 탭만. swipe 지원은 `react-swipeable` 같은 라이브러리 필요.

---

## 관련 문서

- [[frontend/app/legacy/page.tsx.md]] — 데스크톱/모바일 분기
- [[frontend/app/legacy/_components/InventoryTab.tsx.md]] — 재고 탭
- [[frontend/app/legacy/_components/WarehouseIOTab.tsx.md]] — 입출고 탭
- [[frontend/app/legacy/_components/HistoryTab.tsx.md]] — 이력 탭
- [[frontend/app/legacy/_components/AdminTab.tsx.md]] — 관리 탭
- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] — 데스크톱 버전

Up: [[frontend/app/legacy/_components/_components]]
