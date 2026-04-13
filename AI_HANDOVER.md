# AI_HANDOVER

## 0. Latest Codex Update (2026-04-14)

This section summarizes the latest state so Claude can continue work without re-discovering the current desktop structure.

### Desktop legacy shell
- Active desktop tabs are intentionally reduced to 3:
  - `inventory`
  - `warehouse`
  - `admin`
- Source: `frontend/app/legacy/_components/DesktopLegacyShell.tsx`
- A dedicated desktop department tab is not part of the active desktop shell anymore.

### Desktop inventory view
- Source: `frontend/app/legacy/_components/DesktopInventoryView.tsx`
- The old stacked left filter sidebar was removed from the desktop inventory layout.
- The top area now follows the legacy HTML style more closely:
  - search
  - chip filters
  - KPI cards
  - insight cards
- KPI behavior was corrected:
  - `전체 / 정상 / 부족 / 품절` changes only the list below
  - top KPI totals should not change just because the status filter is selected
- Top insight cards now include:
  - 생산 중단 위기
  - 발주 필요
  - 정상
  - 즉시생산
  - 최대생산
  - 병목 원인

### Desktop operations / warehouse view
- Source: `frontend/app/legacy/_components/DesktopWarehouseView.tsx`
- Current top-level operation groups are:
  - `원자재 입출고`
  - `창고 입출고`
  - `부서 입출고`
  - `패키지 출하`
- The screen is now organized as:
  - left operations pane
  - right confirm/execute pane
- Detail direction buttons are shown below the selected operation group.
- Quantity controls were moved into the confirm/execute side panel.
- Upper sections were compressed vertically so the item list can stay visibly longer.

### Branding
- Sidebar branding now uses the company logo image instead of the old text lockup.
- Assets:
  - `frontend/public/dexcowin-logo.png`
  - `frontend/app/legacy/_components/DesktopSidebar.tsx`
- 2026-04-14 batch 1-2:
  - sidebar logo presentation was adjusted to show the DEXCOWIN image more directly on a white logo plate
  - duplicate page titles were reduced by hiding topbar titles for the desktop `inventory` and `warehouse` tabs so the in-content title remains the single visible title

### Sample data / seed
- `backend/seed.py` can seed from the legacy HTML sample dataset.
- This is useful for demo/sample UX testing, but it should not be treated as guaranteed live production truth.

### Repo cleanup performed
- This cleanup was non-destructive and archive-first.
- Archived reference zip:
  - `_archive/reference/files.zip`
- Archived unused desktop component:
  - `frontend/_archive/legacy-unused/DesktopDeptView.tsx`
- Archived previous standalone app-router frontends:
  - `frontend/_archive/standalone-app-routes/admin`
  - `frontend/_archive/standalone-app-routes/bom`
  - `frontend/_archive/standalone-app-routes/history`
  - `frontend/_archive/standalone-app-routes/inventory`
  - `frontend/_archive/standalone-app-routes/operations`
- Their original routes now redirect to `/` so the current legacy shell stays the single main frontend.
- Archive guidance files added:
  - `_archive/README.md`
  - `frontend/_archive/legacy-unused/README.md`
  - `frontend/_archive/standalone-app-routes/README.md`
- `frontend/tsconfig.json` excludes `_archive` so archived files do not affect build/typecheck.

### 2026-04-14 batch 3-4
- `frontend/app/legacy/_components/DesktopRightPanel.tsx`
  - desktop right panel was widened and changed to a sticky/fixed-feel card so it stays visually anchored while the main list scrolls
- `frontend/app/legacy/_components/DesktopInventoryView.tsx`
  - empty selection state was enlarged to match the larger right panel
  - selected item detail sections were also expanded with larger card radius/padding to fit the new panel proportion

### 2026-04-14 batch 5-6
- `frontend/app/legacy/_components/DesktopInventoryView.tsx`
  - inventory row selection now toggles off when the already-selected row is clicked again
  - the desktop filter strip was simplified toward the legacy HTML shape by removing the visible part-filter row
  - grouped-view toggle was hidden from the main filter area
- `frontend/app/legacy/_components/DesktopWarehouseView.tsx`
  - item selection and package selection now both support click-again-to-deselect behavior

### Important cleanup caution
- Mobile legacy UI still uses the older component tree through `frontend/app/legacy/page.tsx`.
- Do not archive/delete these without replacing mobile `/legacy` behavior:
  - `InventoryTab.tsx`
  - `WarehouseIOTab.tsx`
  - `DeptIOTab.tsx`
  - `HistoryTab.tsx`
  - `AdminTab.tsx`
  - `LegacyLayout.tsx`
  - `Toast.tsx`

### Validation
- Frontend validation after cleanup:
  - `cd frontend && npx tsc --noEmit`
- Local backend `__pycache__/*.pyc` changes are runtime artifacts, not meaningful source edits.

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 비즈니스 로직,
현재 구현 상태, 다음 우선순위를 빠르게 공유하기 위한 작전 지도다.

---

## 1. 프로젝트 개요

- 프로젝트명: 정밀 X-Ray 장비 제조 ERP 시스템
- 목표
  - 모바일: `inventory_v2.html` 감성의 레거시 UI 유지 (`/legacy`)
  - 데스크톱: 발주/생산 관리자가 즉시 행동 가능한 ERP 지휘 통제실

---

## 2. 핵심 비즈니스 로직

- 11단계 제조 공정: RM → TA/TF → HA/HF → VA/VF → BA/BF → FG
- Category 코드
  - RM: 원자재 / TA·TF: 튜브 / HA·HF: 고압 / VA·VF: 진공 / BA·BF: 조립 / FG: 완제품 / UK: 미분류
- 주요 운영 흐름
  - 품목 등록·메타 관리
  - 재고 입고 / 출고 / 조정
  - 창고 ↔ 부서 이동
  - 출하 묶음 기반 패키지 출고
  - BOM 기반 생산입고와 Backflush
  - 거래 이력 조회·내보내기

---

## 3. 기술 스택

- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/erp.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS + recharts
- 원본 데이터: `ERP_Master_DB.csv` (971개 품목)

---

## 4. 작업 규칙

- 모든 파일 UTF-8 저장
- 기능 단위 완료 시 AI_HANDOVER.md 업데이트 후 커밋·푸시
- 브랜치: `claude/analyze-codex-changes-sF2g0`

---

## 5. 실행 메모

```bash
# 시드
python backend/seed.py

# 백엔드
cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8010

# 프론트
cd frontend && npm run dev
```

대표 화면: `http://localhost:3000`

---

## 6. 완료된 전체 작업 이력

### 6-1. 데이터·시드
- [v] seed.py SQLite 기준 정비, 971개 품목 적재 (빈 재고 기본값 100)

### 6-2. 백엔드 라우터
- [v] items / inventory / bom / production / employees / ship-packages / settings 라우터
- [v] 재고 입고·출고·조정 API
- [v] 거래 이력 API + CSV 내보내기
- [v] BOM CRUD + 생산입고 + Backflush API
- [v] Item 레거시 메타 필드: barcode, legacy_file_type, legacy_part, legacy_item_type, legacy_model, supplier, min_stock
- [v] POST /api/settings/reset 안전 초기화

### 6-3. 레거시 UI (/legacy)
- [v] 모바일: inventory_v2.html 감성 재현 (탭·바텀시트·토스트·PIN 잠금)
- [v] 데스크톱: 좌측 탐색 / 중앙 작업대 / 우측 확인 패널 구조

### 6-4. /inventory 페이지 (Zero-Modal Master-Detail)
- [v] 좌측 마스터 패널: 검색·카테고리·재고상태 필터
- [v] 키보드 ↑↓ 탐색 + 우측 상세·처리 패널
- [v] StockFilter: LOW(하드코딩 ≤10) → SAFETY(품목별 min_stock 기준)
- [v] 테이블 컬럼: 현재고/안전재고 + 공급사
- [v] 안전재고 인라인 편집 (PUT /api/items/{id})
- [v] URL 파라미터: ?filter=ZERO|SAFETY, ?item=UUID 자동 적용

### 6-5. 대시보드 (/) 지휘 통제실 재설계
- [v] Zone 1: 품절·발주필요·정상 경보 카드 → 클릭 시 /inventory?filter=ZERO|SAFETY
- [v] Zone 2 (placeholder): ⚡ 즉시생산 / 🏭 최대생산 / ⚠️ 병목 — 백엔드 대기중
- [v] Zone 3: 공정별 위험도 테이블 (CSS 진행바, 행 클릭 → 카테고리 필터)
- [v] Zone 4: recharts BarChart 7일 입출고 추이
- [v] Zone 5: 즉시 조치 목록 (품절 상위 8개, 공급사·안전재고)
- [v] Zone 6: 오늘 입출고 요약 + 최근 10건

### 6-6. /operations 페이지 (단계형 Master-Detail)
- [v] STEP 1: 6개 카드로 작업 유형 선택
  - 창고입고 / 창고출고 / 창고→부서 / 부서→창고 / 부서입고 / 패키지출하
- [v] STEP 2: 부서 pill 버튼 → 직원 자동 필터 드롭다운
- [v] STEP 3: 971개 드롭다운 → 실시간 검색 리스트 (useDeferredValue)
- [v] STEP 4: 수량 +/- + 참조번호 + 메모
- [v] 우측 패널: 현재고·처리후예상 실시간 계산 (음수 시 빨간 경고)
- [v] 처리 후 품목 재고 즉시 갱신 (api.getItem 재페칭)
- [v] 오늘 처리 현황 + 최근 8건 표시

### 6-7. /history 페이지 (Zero-Modal Master-Detail)
- [v] 전체 화면 모달 제거 → 우측 상세 패널로 대체
- [v] 테이블 행 클릭 → 우측 패널에 상세 표시
- [v] ↑↓ 키보드 탐색 (rowRefs + scrollIntoView)
- [v] 비고 인라인 편집 (Pencil → input → api.updateTransactionNotes)
- [v] 컬러 배지: 입고(에메랄드)·출고(레드)·조정(앰버)·자동차감(오렌지)

---

## 7. 남은 프론트엔드 TODO

### 우선순위 1: /bom 페이지 개선
- [ ] 상위 품목 리스트 12개 하드컷 → 검색·스크롤로 교체
- [ ] BOM 트리 시각화 개선 (깊은 계층 레이아웃 깨짐 방지)
- [ ] Where-Used UI 껍데기 구현 (백엔드 API 연결 전 placeholder)
  - 품목 선택 → 우측 패널에 "이 자재가 쓰이는 상위 BOM" 트리 표시

### 우선순위 2: 커스텀 출하 폼 UI
- [ ] /operations 패키지출하 STEP 또는 별도 /shipping 페이지
- [ ] 거래처 드롭다운: [국가_업체명] 형식 (US_Amazon, KR_Hospital 등)
- [ ] 고객 맞춤 구성품 체크박스 (3구 충전기, 넥스트랩, F타입 AC코드 등)
- [ ] 출하 메모 폼
- ※ 백엔드 거래처 테이블 완성 전까지 프론트 UI 먼저 구현 가능

### 우선순위 3: /admin 페이지 레이아웃 정리
- [ ] 현재 한 화면에 직원관리·패키지·비밀번호·내보내기가 혼재
- [ ] 좌측 섹션 메뉴 + 우측 콘텐츠 패널 구조로 전환

### 우선순위 4: Capacity 카드 실수치 연결 (백엔드 완성 후)
- [ ] ⚡ 즉시생산: GET /api/production/fast-track/{fg_item_id}
- [ ] 🏭 최대생산: GET /api/production/max-track/{fg_item_id}
- [ ] ⚠️ 병목: GET /api/production/bottleneck/{fg_item_id}
- 연결 위치: `frontend/app/page.tsx` Zone 2 placeholder 카드

---

## 8. 남은 백엔드 TODO

### 우선순위 1: 생산 Capacity 계산 API

```
GET /api/production/fast-track/{fg_item_id}
  → 현재 반제품(Assy) 재고 기준 즉시 조립 가능 수량 반환

GET /api/production/max-track/{fg_item_id}
  → 하위 원자재까지 전개하여 최대 조립 가능 수량 반환

GET /api/production/bottleneck/{fg_item_id}
  → 수량을 제한하는 핵심 자재/Assy item_id + 부족 수량 반환
```

구현 힌트: `GET /api/bom/{parentItemId}/tree` 재귀 트리를 순회하여
각 노드의 (재고 / BOM 수량) 비율 최솟값을 추적.
라우터 신설 위치: `backend/app/routers/production.py`

### 우선순위 2: BOM Where-Used (역추적) API

```
GET /api/bom/where-used/{item_id}
  → 해당 자재가 직접 또는 간접 하위로 포함된 상위 BOM 트리 반환
  → 응답: [{ parent_item_id, parent_item_name, depth, path[] }]
```

### 우선순위 3: Inventory 이원화 (창고 vs 생산부)

- Inventory 테이블에 `warehouse_qty`, `production_qty` 컬럼 추가
  또는 `location` 필드 기반 분리 집계 API 신설
- 창고→부서 이동 트랜잭션 시 두 수량을 동시에 조정

### 우선순위 4: 거래처 관리 + 출하 스펙 이력

```sql
-- 신규 테이블
customers (customer_id, code VARCHAR, name VARCHAR, country VARCHAR, region VARCHAR)
-- 예: code="US_Amazon", country="US"

shipment_specs (spec_id, log_id FK, customer_id FK,
  charger_3pin BOOLEAN, ac_cord_type VARCHAR, neckstrap BOOLEAN,
  custom_options JSON, notes TEXT)
```

- CRUD: GET/POST/PUT/DELETE /api/customers
- POST /api/inventory/ship 확장: customer_id + spec 옵션 포함

### 우선순위 5: 엑셀 다운로드 (포맷된)

- GET /api/items/export.xlsx
- GET /api/inventory/transactions/export.xlsx
- openpyxl 사용, 여백·헤더 색상·열 너비 자동 맞춤

### 우선순위 6: BOM 무결성 검증

- Backflush 시 직계 하위 항목만 차감 (재귀 중복 차감 방지)
- POST /api/bom/validate: 순환 참조 감지

### 우선순위 7: 3월 기준 데이터 동결·시뮬레이션

- DB 스냅샷 저장 엔드포인트
- 시뮬레이션 환경 분리 (별도 DB 파일)

---

## 9. 핵심 파일 경로

### 백엔드

| 파일 | 역할 |
|------|------|
| `backend/app/models.py` | DB 모델 정의 |
| `backend/app/schemas.py` | Pydantic 스키마 |
| `backend/app/routers/items.py` | 품목 CRUD |
| `backend/app/routers/inventory.py` | 재고 입출고·이력 |
| `backend/app/routers/bom.py` | BOM CRUD + 트리 |
| `backend/app/routers/production.py` | 생산입고 + Capacity API 신설 위치 |
| `backend/app/routers/settings.py` | PIN·초기화 |
| `backend/seed.py` | 초기 데이터 적재 |

### 프론트엔드

| 파일 | 역할 |
|------|------|
| `frontend/app/page.tsx` | 대시보드 (지휘 통제실) |
| `frontend/app/inventory/page.tsx` | 재고 목록 (Zero-Modal) |
| `frontend/app/operations/page.tsx` | 입출고 (단계형) |
| `frontend/app/history/page.tsx` | 거래 이력 (Zero-Modal) |
| `frontend/app/bom/page.tsx` | BOM/생산 ← 다음 개선 대상 |
| `frontend/app/admin/page.tsx` | 관리자 ← 다음 개선 대상 |
| `frontend/lib/api.ts` | API 클라이언트 + 타입 정의 |
| `frontend/components/AppHeader.tsx` | 공통 헤더·네비게이션 |

---

## 10. api.ts에 추가 필요한 타입·함수

Capacity API 완성 시 `frontend/lib/api.ts`에 추가:

```typescript
export interface CapacityResult {
  fg_item_id: string;
  fast_track: number;
  max_track: number;
  bottleneck_item_id: string | null;
  bottleneck_item_name: string | null;
  bottleneck_shortage: number;
}

// api 객체에 추가
getCapacity: (fgItemId: string) => Promise<CapacityResult>
```

거래처 API 완성 시:

```typescript
export interface Customer {
  customer_id: string;
  code: string;   // "US_Amazon"
  name: string;
  country: string;
}
getCustomers: () => Promise<Customer[]>
createCustomer: (data: Omit<Customer, "customer_id">) => Promise<Customer>
```

---

## 11. 검증 체크리스트

```bash
python -m compileall backend
cd frontend && npx tsc --noEmit
cd frontend && npm run build
curl http://localhost:8010/api/inventory/summary | python -m json.tool
# total_items 가 971 인지 확인
```
