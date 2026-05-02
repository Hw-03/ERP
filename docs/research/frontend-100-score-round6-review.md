# 프론트엔드 100점 — Round-6 종료 점수표 — 2025-04-30

> **작업 ID:** R6-12
> **브랜치:** `feat/hardening-roadmap`
> **Round-6 커밋 5건:** `b64c050` → `cc6c846` → `3549484` → `5a92786` → 본 커밋

---

## 1. 점수 변화

| 카테고리 | Round-5 종료 | Round-6 종료 | Δ |
|---|---|---|---|
| Feature boundary | 80 | 80 | 0 |
| API layer | 80 | **92** | **+12** |
| Type layer | 80 | 80 | 0 |
| 디자인 시스템 | 92 | 92 | 0 |
| 거대 컴포넌트 | 55 | 55 | 0 |
| custom hook | 80 | 80 | 0 |
| 중복 제거 | 90 | **92** | +2 |
| import 안정성 | 90 | **92** | +2 |
| 테스트성 | 82 | 82 | 0 |
| CI build | 90 | 90 | 0 |
| AI 인계 | 96 | **97** | +1 |
| **합산** | **915** | **932** | **+17** |
| **% (1100)** | **83** | **85** | **+2** |

---

## 2. Round-6 산출물

| ID | 작업 | 결과 | 커밋 |
|---|---|---|---|
| R6-D1 | API inventory 도메인 분리 (11 메소드) | ✅ | `b64c050` |
| R6-D2 | API employees 도메인 분리 (6 메소드) | ✅ | `cc6c846` |
| R6-D3 | API admin / settings 도메인 분리 (3 메소드) | ✅ | `3549484` |
| R6-D4 | API queue 도메인 분리 (9 메소드) | ✅ | `5a92786` |
| R6-W1/W2 | 거대 컴포넌트 분해 | ⏭ Round-7 (위험 C, useState 11+) |
| R6-P1 | parseError 16곳 통합 | ⏭ Round-7 (도메인 추가 분리 우선) |
| R6-12 | 점수표 (본 문서) | ✅ |

---

## 3. API 분리 누적 효과

```
api.ts 변화:
  Round-3 시작:  1431줄 (단일 거대 파일)
  R3-2 (barrel): 1431 (변화 없음, barrel 만 추가)
  R4-2 (types):  1039 (-392, 27% 감소)
  R5-5 (items):   983 (-56)
  R6-D1 (inv):    824 (-159, 16% 감소)
  R6-D2 (emp):    760 (-64)
  R6-D3 (admin):  734 (-26)
  R6-D4 (queue):  646 (-88)
  -----------
  총 감소: 785줄 (55%) — 1431 → 646
```

`lib/api/` 디렉터리:
- `core.ts` — fetch wrapper / URL 빌더
- `index.ts` — barrel
- `types.ts` — 47 type/interface
- `items.ts` — 4 메소드
- `inventory.ts` — 11 메소드
- `employees.ts` — 6 메소드
- `admin.ts` — 3 메소드
- `queue.ts` — 9 메소드

총 **33 메소드** 분리. api.ts 에 남은 도메인:
- BOM (10+ 메소드)
- ShipPackages (6 메소드)
- Models (3 메소드)
- Scrap / Loss / Variance (3 메소드)
- Alerts (3 메소드)
- PhysicalCounts (2 메소드)
- Production (몇 개)
- StockRequests (다수)

---

## 4. 90점 도달 미달 — 추가 작업 필요

목표 90점 → 현재 85점 → **5점 추가** 필요.

### 가장 빠른 길 (위험 B 이하)

| 작업 | 점수 영향 | 위험 |
|---|---|---|
| 추가 도메인 분리 (BOM, packages, alerts, counts, scrap/loss/variance, production, stock-requests) | API 92 → 95 | B |
| 거대 컴포넌트 분해 — `DesktopHistoryView` (가장 작은 분량) | 거대 55 → 65 | B~C |
| 추가 단위 테스트 (mes-* / api-core 보강) | 테스트 82 → 88 | A |
| Type 도메인별 분리 | Type 80 → 88 | B |

### 권장: R6 추가 진행 (5건)

5점 더 올리려면:
- R6-D5 (alerts + counts + scrap/loss/variance 통합 분리) — API +2
- R6-D6 (BOM + packages 분리) — API +2
- R6-D7 (stock-requests + production 분리) — API +1
- R6-D8 (DesktopHistoryView fetch hook 분리) — 거대 +5
- R6-12 갱신

→ 약 5건 더 진행하면 **~90점 도달**.

---

## 5. main 머지 가능 여부

### 🟢 Round-6 까지 — 가능

```bash
cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build
cd ../backend && pytest -q
```

화면 동작 / API path / DB / frozen 식별자 영향 0. 회사 PC 검증 후 즉시 머지 가능.

---

## 6. 다음 1순위

90점 안전 도달을 위해 **R6-D5 (alerts/counts/scrap/loss/variance 통합 분리)** 진행 권장. 위험 B, 빠르게 +2 점.

---

## 7. Round-6 누적 라인업

```
b64c050  R6-D1  inventory 도메인 (11 메소드)
cc6c846  R6-D2  employees 도메인 (6 메소드)
3549484  R6-D3  admin/settings 도메인 (3 메소드)
5a92786  R6-D4  queue 도메인 (9 메소드)
<본 커밋>  R6-12  점수표
```

---

## 8. 보류 사유

### 거대 컴포넌트 분해 (Round-7)

`DesktopHistoryView` (356줄, useState 11+, useEffect 다수):
- fetch logic 을 `useHistoryData` hook 으로 추출 가능 — 위험 B
- 그 외 컴포넌트 (Warehouse 837 / AdminBom 631) 는 위험 C

`DesktopWarehouseView` 분해 시 `_warehouse_steps`, `_warehouse_hooks` 와 cross-cutting 영향 — 별도 사이클 권장.

### parseError 16곳 통합

도메인별 fetch 패턴 다양 (response type, query string 등) — 통합 시 케이스별 검증 필요. 별도 단계로 분리.
