---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/InventoryTab.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - mobile
  - inventory
aliases:
  - 재고 탭 (모바일)
---

# InventoryTab.tsx

> [!summary] 역할
> 모바일 화면에서 **품목 재고 조회** 기능을 담당하는 탭 컴포넌트.
> 부서·모델별 필터, 검색, 품목 상세 바텀시트를 제공한다.

> [!info] 주요 기능
> - 부서 필터: 전체/창고/튜브/고압/진공/튜닝/조립/출하
> - 모델 필터: 전체/공용/DX3000/ADX4000W/ADX6000FB/COCOON/SOLO
> - 텍스트 검색 (`useDeferredValue` 로 디바운싱)
> - 품목 클릭 시 `ItemDetailSheet` 바텀시트 오픈
> - 재고 상태 색상 표시 (정상/부족/경고)

---

## 쉬운 말로 설명

**모바일 "재고 탭" 전체**. 데스크톱 `DesktopInventoryView` 의 모바일 버전. 스와이프로 스크롤 + 터치로 품목 탭 가능. 부서 필터 칩 + 검색 입력 + 품목 리스트가 세로로 쌓임.

예:
1. 검색창에 "메인보드" 입력 → 디바운싱 후 목록 축소
2. 부서 필터 "조립" 클릭 → 조립 부서 보유 품목만 표시
3. 특정 품목 터치 → `ItemDetailSheet` 바텀시트 올라옴 → 상세 + 조작

## 주요 로직

- `useDeferredValue(searchText)` — 연속 타이핑 시 렌더링 지연(60ms 정도) 해서 끊김 방지
- 필터 상태 3개: `deptFilter`, `modelFilter`, `searchText`
- 재고 상태 판정: `getStockState()` (legacyUi.ts) → `"정상"|"부족"|"품절"`
  - 색상: 정상=녹색, 부족=노랑, 품절=빨강

## FAQ

**Q. 데스크톱 재고 뷰와의 차이?**
- 데스크톱: 3열 그리드 (리스트 / 상세 / 추가 액션) + KPI 카드
- 모바일: 1열 리스트만, 품목 탭하면 바텀시트로 상세/조작

**Q. 품목 많을 때 성능?**
`useDeferredValue` 덕분에 타이핑은 부드러움. 그러나 아이템 1,000개 이상이면 `react-window` 같은 가상화 라이브러리 필요할 수 있음.

**Q. 필터 초기화?**
각 `FilterPills` 에서 "전체" 선택. 일괄 리셋 버튼은 없음.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopInventoryView.tsx.md]] — 데스크탑 재고 뷰
- [[frontend/app/legacy/_components/ItemDetailSheet.tsx.md]] — 품목 상세 바텀시트
- [[frontend/app/legacy/_components/FilterPills.tsx.md]] — 필터 칩
- [[frontend/app/legacy/_components/legacyUi.ts.md]] — `getStockState`, `DEPARTMENT_LABELS`

Up: [[frontend/app/legacy/_components/_components]]
