---
type: code-note
project: ERP
layer: frontend
source_path: frontend/components/CategoryCard.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - ui
aliases:
  - 카테고리 카드
---

# CategoryCard.tsx

> [!summary] 역할
> 11개 ERP 카테고리(RM, TA, TF, HA, HF, VA, VF, BA, BF, FG, UK)를 카드 형태로 표시하는 컴포넌트.
> 각 카테고리의 색상, 아이콘, 재고 합계를 시각적으로 표현한다.

> [!info] 카테고리별 스타일
> | 카테고리 | 아이콘 | 배경 색상 |
> |---------|--------|-----------|
> | RM | 🧱 | slate 계열 |
> | TA | 🧪 | blue (진한) |
> | TF | 🔵 | blue (중간) |
> | HA, HF | 고압 색상 | 주황 계열 |
> | VA, VF | 진공 색상 | 보라 계열 |
> | BA, BF | 조립 색상 | 초록 계열 |
> | FG | 완제품 색상 | 노랑 계열 |

> [!warning] 주의
> 이 컴포넌트는 현재 `frontend/app/legacy/` 의 실제 UI에서 직접 사용되지 않고,
> 레거시 구조 이전 라우트(`/inventory` 등)에서 사용 예정이었던 컴포넌트다.

---

## 쉬운 말로 설명

**카테고리별 요약 카드 UI**. 11개 ERP 카테고리(원자재 RM, 튜브 TA/TF, 고압 HA/HF, 진공 VA/VF, 조립 BA/BF, 완제품 FG, 미분류 UK) 각각을 화려한 카드로 표시.

각 카드 요소:
- 이모지/아이콘
- 카테고리명(한글)
- 재고 합계 수량
- 품목 수 (예: "전체 34종")

## 카테고리 기호 의미

| 기호 | 뜻 | 예 |
|------|-----|-----|
| RM | Raw Material (원자재) | 나사, 판금 |
| TA/TF | Tube 조립/부품 | 튜브 하네스 |
| HA/HF | 고압부 조립/부품 | 고압 레귤레이터 |
| VA/VF | 진공부 조립/부품 | 진공 밸브 |
| BA/BF | 조립(Body) 조립/부품 | 섀시 |
| FG | Finished Goods (완성품) | DX3000 본체 |
| UK | Unknown (미분류) | 신규 등록 직후 품목 |

(A = Assembly, F = Fabricated part/단품)

## FAQ

**Q. 현재 실제로 쓰이는가?**
레거시 UI 전환 단계에서 사용 예정. 현재 주력은 `legacy/_components/*`.

**Q. 색상 커스터마이즈?**
`legacyUi.ts` 의 `LEGACY_COLORS` 참조하되, 각 카테고리별 매핑은 이 컴포넌트 내부 상수.

---

## 관련 문서

- [[frontend/components/components]] — 공용 컴포넌트 목록
- [[frontend/lib/api.ts.md]] — `Category`, `CategorySummary` 타입 정의
- 용어 사전 — RM/TA/TF 등 카테고리 용어

Up: [[frontend/components/components]]
