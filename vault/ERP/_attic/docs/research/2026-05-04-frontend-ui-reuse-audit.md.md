---
type: file-explanation
source_path: "_attic/docs/research/2026-05-04-frontend-ui-reuse-audit.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-04-frontend-ui-reuse-audit.md — 2026-05-04-frontend-ui-reuse-audit.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-04-frontend-ui-reuse-audit.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `프론트 UI 컴포넌트 재사용성 감사 보고서`
- `1. 요약`
- `현재 전체 프론트 UI 재사용 수준`
- `가장 큰 문제 5개`
- `가장 먼저 고쳐야 할 영역 5개`
- `2. 현재 존재하는 공통 컴포넌트 목록`
- `2.1 `frontend/app/legacy/_components/common/``
- `2.2 `frontend/lib/ui/``
- `2.3 `frontend/lib/mes*/``
- `2.4 모바일 primitives (18개) — `mobile/primitives/``

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 프론트 UI 컴포넌트 재사용성 감사 보고서

**작성일:** 2026-05-04  
**감사 범위:** `frontend/app/legacy/` 전체 + `frontend/lib/mes*`, `frontend/lib/ui/`  
**목적:** 화면마다 새로 만들어지는 카드·버튼·배지·테이블을 파악하고, 공통 컴포넌트 중심으로 조립하는 구조로 바꾸기 위한 단계별 계획 수립

---

## 1. 요약

### 현재 전체 프론트 UI 재사용 수준

**전체 점수: 68/100**

- 공통 컴포넌트는 잘 만들어져 있다. EmptyState, LoadingSkeleton, StatusPill, ConfirmModal, Toast, BottomSheet 모두 완성도 높다.
- 그러나 각 화면 개발 시 기존 컴포넌트를 가져다 쓰지 않고 직접 만드는 경향이 지속되고 있다.
- 특히 FilterChip, KPI 카드, 슬라이딩 패널 같이 코드가 완전히 동일한 것도 화면별로 따로 구현되어 있다.
- 모바일 primitives(18개)는 잘 정리되어 있으나 데스크톱 common과 연결이 없다.

### 가장 큰 문제 5개

1. **FilterChip 코드 완전 복제** — `InventoryFilterBar.tsx`와 `HistoryFilterBar.tsx`에 동일한 Chip 함수가 각각 있다.
2. **슬라이딩 패널 애니메이션 복제** — 436px, 160ms, cubic-bezier 값이 두 파일에 정확히 복제되어 있다.
3. **color-mix 인라인 50회 이상** — `color-mix(in srgb, ${tone} 14%, transparent)` 패턴이 전체 코드에 흩어져 있다.
4. **KPI/통계 카드 구조 4회 반복** — 라벨+숫자+설명+tone 패턴이 화면마다 직접 만들어진다.
5. **EmptyState/LoadingSkeleton 미사용** — `HistoryTable`이 공통 컴포넌트 대신 직접 텍스트를 작성한다.

### 가장 먼저 고쳐야 할 영역 5개

1. `common/FilterChip.tsx` 추출 — 동일 코드 즉시 제거 가능, 영향 범위 작음
2. `common/SlidePanel.tsx` 추출 — 슬라이딩 패널 애니메이션 단일화
3. `lib/mes/colorUtils.ts` — `tint(tone, pct)` 헬퍼 추가로 color-mix 중복 해소
4. `HistoryTable` 로딩 텍스트 → `LoadingSkeleton` 교체 — 한 줄 변경
5. 주간보고 "이번 주" 배지 → `StatusPill` 교체 — 커스텀 span 제거

---

## 2. 현재 존재하는 공통 컴포넌트 목록

### 2.1 `frontend/app/legacy/_components/common/`

| 컴포넌트 | 역할 | 현재 사용처 | 재사용성 | 부족한 점 |
|---|---|---|---|---|
| `EmptyState` | 빈 상태 3 variant (no-data/no-search/filtered-out) | InventoryItemsTable, WeeklyDetailTable | ✅ 높음 | 모바일 별도 구현과 통합 미완 |
| `LoadingSkeleton` | 로딩 스켈레톤 3 variant (table/card/list) | DesktopWeeklyReportView, InventoryView | ✅ 높음 | HistoryTable에서 미사용 |
| `LoadFailureCard` | 실패 상황 alert (재시도 버튼 포함) | 여러 화면의 error 상태 | ✅ 높음 | 없음 |
| `StatusPill` | 상태 배지 (MesTone 5종 지원) | DesktopTopbar, 일부 화면 | ✅ 높음 | 커스텀 span으로 직접 구현하는 곳이 있음 |
| `ResultModal` | 작업 결과 모달 (성공/부분/실패) | 입출고 완료 | ✅ 높음 | 데스크톱 전용, lib/ui/로 이동 고려 |

### 2.2 `frontend/lib/ui/`

| 컴포넌트 | 역할 | 현재 사용처 | 재사용성 | 부족한 점 |
|---|---|---|---|---|
| `Toast` | 자동 닫히는 알림 (3종) | 입출고 완료, AlertsSheet | ✅ 공용 | 전역 상태 없음 — 각 페이지에서 useState 관리 |
| `ConfirmModal` | 확인/취소 모달 (tone 지원, busy 상태) | 모바일/데스크톱 입출고 | ✅ 높음 | 없음 |
```
