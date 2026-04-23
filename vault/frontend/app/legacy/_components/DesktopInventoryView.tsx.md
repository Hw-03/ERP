---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopInventoryView.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - inventory
aliases:
  - 재고 현황 화면
  - 재고 뷰
---

# DesktopInventoryView.tsx

> [!summary] 역할
> 데스크톱 재고 현황 탭의 메인 화면. 검색, 카테고리 필터, KPI 카드, 인사이트 카드, 품목 목록을 보여준다.

> [!info] 주요 책임
> - 상단: 검색창 + 카테고리 칩 필터
> - KPI 카드: 전체/정상/부족/품절 수량
> - 인사이트 카드: 생산 중단 위기, 발주 필요, 즉시생산 가능, 최대생산, 병목 원인
> - 품목 목록 테이블 (필터 적용)
> - 품목 클릭 시 상세 패널(`DesktopRightPanel`) 표시

> [!warning] 주의
> - KPI 카드의 전체 합계 수치는 상태 필터와 무관하게 항상 전체 기준 표시
> - 좌측 필터 사이드바는 제거됨 (상단 칩 필터로 대체)

---

## 쉬운 말로 설명

**대시보드 탭**. 재고 전체 현황을 한눈에 보여주는 화면. 화면이 크게 4개 구역으로 나뉨:
1. **상단** — 검색창 + 부서 필터 (전체/창고/튜브/고압/진공/튜닝/조립/출하)
2. **KPI 카드 4장** — ALL / NORMAL(정상) / LOW(안전재고 미달) / ZERO(품절). 클릭 시 해당 상태만 필터.
3. **인사이트 카드** — 생산 위기·발주 필요·즉시생산 가능 등 자동 분석
4. **품목 목록 테이블** — 100개씩 페이징. 품목 클릭 시 우측 상세 패널(`DesktopRightPanel`) 열림.

---

## 주요 Props

```typescript
{
  globalSearch: string;       // 전역 검색어 (현재는 빈 문자열로 고정)
  onStatusChange: (msg: string) => void;  // 탑바 상태 메시지 업데이트
  onGoToWarehouse: (item: Item) => void;  // 입출고 탭으로 이동하며 품목 사전선택
}
```

---

## 데이터 호출

- `api.getItems()` — 전체 품목 (SWR 기반 자동 재조회 없음, 직접 useEffect)
- `api.getInventorySummary()` — 카테고리별 집계 (일부 인사이트)
- `api.getTransactions(...)` — 최근 거래 (인사이트용)

## 내부 필터

| 필터 | 용도 |
|------|------|
| `keyword` | 검색창. ERP코드/품목명/사양/위치/공급사/모델/바코드 모두 검사 |
| `dept` | 부서 드롭다운 (창고/조립 등) |
| `kpi` | KPI 카드 클릭 (NORMAL/LOW/ZERO) |

`getMinStock(item)` 은 `min_stock == null` 이면 기본값 `10` 사용.

---

## FAQ

**Q. 검색 반응이 느리다?**
`useDeferredValue(keyword)` 로 과도한 리렌더 방지. 타이핑 중엔 이전 결과 유지, 멈추면 재계산.

**Q. 품목이 많을 때 페이지네이션은?**
한 번에 100개 (`DESKTOP_PAGE_SIZE`). 스크롤 하단에 "더 보기" 버튼.

**Q. 품목 클릭 시 뭐가 열리나?**
우측 패널(`DesktopRightPanel`) 에 상세정보 + 최근 거래 + "입출고로 이동" 버튼 표시.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]]
- [[frontend/app/legacy/_components/DesktopRightPanel.tsx.md]]
- [[frontend/app/legacy/_components/FilterPills.tsx.md]]
- [[frontend/app/legacy/_components/legacyUi.ts.md]] — `getStockState`, `LEGACY_COLORS`
- [[frontend/lib/api.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]
