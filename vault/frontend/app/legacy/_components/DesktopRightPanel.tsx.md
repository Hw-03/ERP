---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopRightPanel.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
aliases:
  - 우측 패널
  - 품목 상세 패널
---

# DesktopRightPanel.tsx

> [!summary] 역할
> 품목 선택 시 우측에 슬라이드로 나타나는 상세 정보 패널.

> [!info] 주요 책임
> - 선택된 품목의 상세 정보 표시 (ERP 코드, 재고 수량, 위치별 분포)
> - 입고/출고/조정 등 빠른 작업 버튼 제공
> - 재고 위치(창고/부서별) 수량 시각화

---

## 쉬운 말로 설명

**재사용 가능한 우측 사이드 패널 프레임**. 실제 내용은 하나도 없고 제목/부제/스크롤 영역만 제공하는 껍데기(container). 내용은 `children` 으로 주입.

폭 고정 420px. 각 뷰(`DesktopInventoryView`, `DesktopWarehouseView`, `DesktopHistoryView`)가 자기 맥락의 상세 정보를 children 으로 채움.

---

## Props

```typescript
{
  title: string;              // 상단 큰 글자
  subtitle?: string;          // 상단 작은 글자 (선택)
  children: React.ReactNode;  // 스크롤 영역 본문
}
```

---

## 주의사항

- 이 파일 자체엔 **비즈니스 로직이 없음**. 품목 상세 / 거래 상세 등은 부모가 렌더링해서 children 으로 넘겨야 함.
- 스크롤바 숨김(`scrollbar-hide`) — 전용 유틸 클래스. Tailwind 글로벌 CSS에 정의됨.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] — 주요 소비처
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]]
- [[frontend/app/legacy/_components/legacyUi.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]
