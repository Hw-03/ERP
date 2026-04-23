---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/legacyUi.ts
status: active
tags:
  - erp
  - frontend
  - utility
  - theme
  - legacy
aliases:
  - 레거시 UI 유틸
---

# legacyUi.ts

> [!summary] 역할
> 레거시 UI 전체에서 공통으로 사용하는 **색상 상수, 포맷 함수, 배지 유틸**을 모아둔 파일.
> CSS 변수 기반 색상 객체(`LEGACY_COLORS`)와 다양한 헬퍼 함수를 export 한다.

> [!info] LEGACY_COLORS 객체
> CSS 변수를 TypeScript 상수로 매핑한 테마 팔레트.
> - `bg`, `s1`~`s4`: 배경 레이어 (어두운 순)
> - `border`, `borderStrong`: 테두리
> - `blue`, `green`, `red`, `yellow`, `purple`, `cyan`: 상태 색상
> - `text`, `muted`, `muted2`: 텍스트 계층

> [!info] 주요 유틸 함수
> | 함수 | 설명 |
> |------|------|
> | `formatNumber(n)` | 숫자를 천단위 쉼표 포맷으로 변환 |
> | `getStockState(item)` | 재고 상태 판정 (정상/부족/위험) |
> | `erpCodeDeptBadge(code)` | ERP 코드에서 부서 배지 추출 |
> | `transactionLabel(type)` | 거래 유형 한글 라벨 반환 |
> | `transactionColor(type)` | 거래 유형별 색상 반환 |
> | `employeeColor(id)` | 직원 ID → 아바타 색상 |
> | `firstEmployeeLetter(name)` | 직원 이름 첫 글자 추출 |
> | `normalizeDepartment(dept)` | 부서 코드 정규화 |
> | `normalizeModel(model)` | 모델명 정규화 |
> | `buildItemSearchLabel(item)` | 품목 검색 레이블 생성 |

---

## 쉬운 말로 설명

**레거시 컴포넌트 공용 상수·유틸 모음**. 모든 Desktop* / *Tab 컴포넌트가 여기서 색상 팔레트 + 포맷터 + 부서/모델 라벨을 가져다 씀.

277줄 중 상수가 대부분, 함수는 10개 정도. 이 파일 수정 시 **모든 레거시 화면에 영향**이라 주의.

---

## LEGACY_COLORS (CSS 변수 매핑)

```typescript
{
  bg: "var(--c-bg)",           // 최외곽 배경
  s1, s2, s3, s4: "var(--c-sX)", // 레이어 배경 (밝기 단계)
  border, borderStrong,         // 테두리
  blue, green, red, yellow,     // 상태 색상
  purple, cyan,
  text, muted, muted2,          // 텍스트 3단계
  panelGlow,                    // 강조 패널 그라데이션
}
```

CSS 변수는 `app/globals.css` 의 `:root` 와 `[data-theme="dark"]` 에서 정의. 테마 토글 시 값만 바뀌고 상수 참조는 그대로.

---

## 상수 맵

### `DEPARTMENT_LABELS` — DB 값(`조립`, `고압` 등) → 표시 라벨
(대부분 동일, 일부 `연구` → `연구소`)

### `DEPARTMENT_ICONS` — 부서 → 아바타 약자 (한 글자)
`조/고/진/튜/A/연/영/출/기`

### `LEGACY_PARTS` / `LEGACY_MODELS` — 필터 드롭다운 옵션
```
LEGACY_PARTS: ["전체", "자재창고", "조립출하", "고압파트", "진공파트", "튜닝파트"]
LEGACY_MODELS: ["전체", "DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"]
```

---

## 주요 함수

### `formatNumber(n: number | null)` 
`1234567` → `"1,234,567"`. null/undefined → `"-"`.

### `getStockState(item: Item)`
`item.quantity` 와 `min_stock` 을 비교해 `"정상" | "부족" | "품절"` 반환. `min_stock==null` 이면 기본 10 사용.

### `transactionLabel(type: TransactionType)` / `transactionColor(type)`
거래 유형 → 한글 라벨 + 색상. 예: `RECEIVE` → "입고" + 녹색.

### `employeeColor(dept: string | null)` / `firstEmployeeLetter(name: string)`
아바타 원형 배지 생성용. 부서별 고정 색상 + 이름 첫 글자.

### `normalizeDepartment(value)` / `normalizeModel(value)`
NULL / 빈문자열 → `"기타"`. 표시 안정화.

### `buildItemSearchLabel(item)`
품목 검색 UI 에서 표시할 축약 라벨. `"ERP-CODE · 품목명 · 스펙"` 형태.

### `erpCodeDeptBadge(code)`
`3-AR-0012` → "조립" 같은 부서 배지 추출 (process_type_code 로 매핑).

---

## FAQ

**Q. 새 부서 추가하려면?**
4곳 수정: `DEPARTMENT_LABELS`, `DEPARTMENT_ICONS`, `employeeColor`, 그리고 `@/lib/api` 의 `Department` Union 타입.

**Q. 색상을 변경하려면?**
`globals.css` 의 CSS 변수만 수정. 이 파일은 건드릴 필요 없음.

**Q. 테마별 색상?**
`[data-theme="dark"]` / `[data-theme="light"]` 셀렉터에 각기 CSS 변수 값 지정. `ThemeToggle` 이 `document.documentElement.dataset.theme` 변경.

---

## 관련 문서

- [[frontend/app/legacy/_components/_components]] — 레거시 컴포넌트 전체 목록
- [[frontend/app/globals.css.md]] — CSS 변수 원본 정의
- [[frontend/app/legacy/_components/ThemeToggle.tsx.md]]

Up: [[frontend/app/legacy/_components/_components]]
