---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-04-frontend-ui-reuse-audit.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-04-frontend-ui-reuse-audit.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-04-frontend-ui-reuse-audit.md]]

## 원본 첫 줄 (또는 메타)

```
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
```
