# 아키텍처 개요

이 문서는 다음 사람이 한 시간 안에 코드 구조를 머리에 넣을 수 있도록 쓴 짧은 안내서다.

## 스택

- 백엔드: Python 3.13 · FastAPI · SQLAlchemy · SQLite (WAL)
- 프론트엔드: Next.js 14 (App Router) · React · Tailwind · TypeScript strict

## 폴더 구조 (운영에 의미 있는 부분만)

```
ERP/
├── backend/
│   └── app/
│       ├── main.py                  # 라우터 등록, /health, CORS
│       ├── database.py              # SQLite + WAL, get_db
│       ├── models.py                # SQLAlchemy 모델 + 16 enum (621줄)
│       ├── schemas.py               # Pydantic 요청/응답 (40+ 모델)
│       ├── routers/
│       │   ├── inventory.py         # 입출고/이동/불량/CSV·XLSX (819줄)
│       │   ├── items.py             # 품목 CRUD (437줄)
│       │   ├── production.py        # 생산 입고 + BOM 자동 차감
│       │   ├── queue.py             # 큐 배치 생성/확정/취소
│       │   ├── bom.py / codes.py / employees.py / ship_packages.py / alerts.py
│       └── services/
│           ├── inventory.py         # 입출고 비즈니스 로직 (445줄, 12 함수)
│           ├── stock_math.py        # 재고 계산 일원화 (151줄)
│           ├── bom.py / codes.py / queue.py / integrity.py
├── frontend/
│   ├── lib/api.ts                   # 백엔드 API 클라이언트
│   └── app/
│       ├── legacy/                  # 주 사용 화면(/legacy)
│       │   ├── _components/
│       │   │   ├── DesktopLegacyShell.tsx
│       │   │   ├── DesktopSidebar.tsx
│       │   │   ├── DesktopTopbar.tsx
│       │   │   ├── DesktopInventoryView.tsx       # 대시보드(재고)
│       │   │   ├── DesktopWarehouseView.tsx       # 입출고 wizard
│       │   │   ├── _warehouse_steps.tsx           # wizard 5단계 컴포넌트
│       │   │   ├── SelectedItemsPanel.tsx         # 4단계 수량 입력
│       │   │   ├── DesktopHistoryView.tsx         # 입출고 내역
│       │   │   ├── DesktopAdminView.tsx           # 관리자
│       │   │   ├── legacyUi.ts                    # LEGACY_COLORS · 헬퍼
│       │   │   └── common/                        # ★ 이번에 신설된 공용 부품
│       │   │       ├── EmptyState.tsx
│       │   │       ├── LoadFailureCard.tsx
│       │   │       ├── LoadingSkeleton.tsx
│       │   │       ├── StatusPill.tsx
│       │   │       ├── ConfirmModal.tsx
│       │   │       └── ResultModal.tsx
│       │   └── page.tsx
│       └── (admin|alerts|history|inventory|operations|queue|...)/page.tsx  # 단순 진입점
├── docs/                            # 모든 문서
└── scripts/                         # 운영 스크립트 (backup_db.bat, healthcheck.bat 등)
```

## 백엔드 레이어

3 계층 구조 — 라우터 → 서비스 → 모델/DB.

- **라우터** (`app/routers/*.py`): 요청 파싱·검증, 응답 변환. 비즈니스 로직은 서비스에 위임. response_model 일관 사용.
- **서비스** (`app/services/*.py`): 트랜잭션·비즈니스 규칙. `inventory.py` 가 입출고의 모든 동작(예약 / 입고 / 이동 / 불량 / 반품 / 부서간 이동)을 가진다.
- **재고 계산 일원화**: `app/services/stock_math.py`
  - `compute_for(db, item_id) -> StockFigures` — 단건
  - `bulk_compute(db, item_ids) -> dict[item_id, StockFigures]` — 다건 (N+1 방지용)
  - 모든 라우터·서비스는 직접 합계를 계산하지 않고 이 모듈만 사용한다.

### 재고 3-bucket 모델

품목 1건의 재고는 다음 합으로 표현된다.

```
total = warehouse_qty + production_total + defective_total
available = total - pending_quantity   # 예약 차감 후 가용 재고
```

| bucket | 의미 |
|---|---|
| warehouse_qty | 자재창고 보관량 |
| production_total | 생산부서별 보관량 합계 (`InventoryLocation` 의 status=PRODUCTION) |
| defective_total | 불량 격리 보관량 합계 (status=DEFECTIVE) |
| pending_quantity | 큐 OUT으로 예약된 양 (소비 전) |

`InventoryLocation` 은 (item, department, status) 단위 보관량 기록이다.

### 주요 엔드포인트

| 메서드 | 경로 | 의미 |
|---|---|---|
| GET | `/health`, `/health/detailed` | 헬스체크 (`detailed`는 DB 점검 + mismatch 카운트) |
| GET | `/api/items` | 품목 목록 (bulk_compute로 N+1 제거) |
| GET | `/api/inventory/summary` | 카테고리별 재고 요약 |
| POST | `/api/inventory/receive` | 창고 입고 |
| POST | `/api/inventory/ship` | 창고 출고 (출하부) |
| POST | `/api/inventory/transfer-to-production` | 창고 → 부서 이동 |
| POST | `/api/inventory/transfer-to-warehouse` | 부서 → 창고 복귀 |
| POST | `/api/inventory/transfer-between-depts` | 부서간 이동 |
| POST | `/api/inventory/mark-defective` | 불량 격리 |
| POST | `/api/inventory/return-to-supplier` | 공급업체 반품 |
| POST | `/api/inventory/ship-package` | 패키지 출고 (bulk · shortages dict 응답) |
| GET | `/api/inventory/transactions` | 거래 이력 |

응답·에러 detail의 표준화는 다음 작업에서 진행 예정. 현재는 단순 문자열 detail 95% + 일부 dict detail (shortages 등) 5% 가 공존한다.

## 프론트 레이어

- App Router: 대부분의 페이지는 `/legacy` 셸로 리다이렉트되거나 그 일부를 보여주는 단순 진입점이다. 실제 UI는 `frontend/app/legacy/_components/` 안에 있다.
- 데이터 페칭: `frontend/lib/api.ts` 의 단순 fetch 기반. SWR / React Query 사용 안 함. 페이지마다 `useState` + `useEffect` 패턴.
- 디자인 토큰: `_components/legacyUi.ts` 의 `LEGACY_COLORS` (CSS 변수 래퍼). 다크/라이트는 CSS 변수로 자동 전환.

### 입출고 wizard 흐름 (5단계)

`DesktopWarehouseView.tsx` 가 부모. 단계별 컴포넌트는 `_warehouse_steps.tsx` 에 분리.

1. **담당자** — `EmployeeStep`
2. **작업 유형** — `WorkTypeStep` (방향/부서/불량 위치 등 부수 옵션 포함)
3. **품목 선택** — `ItemPickStep` (필터 + 100개씩 테이블, 필터로 가려진 선택 안내 포함)
4. **수량·메모** — `QuantityStep` + `SelectedItemsPanel` (현재/실행 후 재고 + 음수 강조 + 메모 200자 카운터)
5. **실행** — `ExecuteStep` (blocker 사유 표시 + 최종 확인 모달)

처리 로직: 부모의 `submit()` 이 `dispatchSingleItem()` 을 단건 루프로 호출하고, 부분 성공/실패는 `ResultModal` 로 안내한다(부분 성공 시 성공한 건은 selectedItems에서 제거되어 재시도해도 이중 처리되지 않는다).

### 공용 UI 부품 (`_components/common/`)

이번 단계에서 신설. 다음 화면들이 같은 시각 언어로 표시되도록 한다.

| 부품 | 용도 |
|---|---|
| `EmptyState` | "데이터 없음 / 검색 결과 없음 / 필터로 가려짐" 3변형 |
| `LoadFailureCard` | 로드 실패 + 새로고침 CTA (인라인) |
| `LoadingSkeleton` | 테이블/카드/리스트 3변형 — 필요 화면에서 사용 |
| `StatusPill` | Topbar/내역/대시보드 공통 — `inferToneFromStatus()` 가 메시지로 톤 추론 |
| `ConfirmModal` | 일반·주의·위험 3톤. busy 중에는 ESC/배경 클릭 잠금 |
| `ResultModal` | 성공·부분실패·실패 3종. 실패 리스트 + primaryAction 슬롯 |

### 부분 분리 vs 미분리 (의도적)

- `DesktopWarehouseView` (1,074줄), `_warehouse_steps.tsx` (1,056줄), `DesktopAdminView` (1,783줄) 등은 분량이 크다. 이번 단계에서는 안전성 위주로 **공용 부품 추출만** 진행했다.
- hook 추출(`useWarehouseWizardState`/`useWarehouseSubmit`/`useWarehouseFilters`) 과 거대 컴포넌트의 의미 단위 분할은 별도 작업으로 미뤄둔다 — 설계서: `docs/FRONTEND_HOOKS_PLAN.md`

## 데이터 흐름 (입출고 1건)

```
사용자 클릭(실행)
  │
  ▼
DesktopWarehouseView.submit()
  │
  └─ for entry in selectedEntries:
        dispatchSingleItem(entry, qty, producedBy)
            │
            ▼  (작업 유형별 분기)
        api.shipInventory / receiveInventory / transferToProduction / ...
            │
            ▼
        FastAPI 라우터 (예: routers/inventory.py:ship)
            │
            ▼
        services.inventory.<함수>
            │
            ├─ 비즈니스 규칙 검증 (재고 부족 등)
            ├─ Inventory + InventoryLocation 갱신
            ├─ TransactionLog 추가
            └─ db.commit() / db.refresh()
            │
            ▼
        응답 (response_model)
  │
  ▼
부분 성공/실패 집계 → ResultModal / completionFlyout / 자동 refresh
```

## 다음 단계 작업 후보

본 문서가 다루지 않는 항목과 미구현 개선은 다음 설계서에 정리되어 있다.

- `docs/BACKEND_REFACTOR_PLAN.md` — 백엔드 리팩터링(commit/refresh 표준화, 에러 detail 표준, ship-package N+1, 운영 파일 정리)
- `docs/FRONTEND_HOOKS_PLAN.md` — 프론트 hook 추출 / 거대 컴포넌트 분할 / `useApi` 헬퍼
