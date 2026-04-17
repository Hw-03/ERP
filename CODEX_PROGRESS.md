# ERP 개선 진행 기록 (Codex 인수용)

> **이 파일은 Codex(또는 다른 AI/사람)가 현재 작업 진행도를 빠르게 파악하기 위한 핸드오버 문서입니다.**
> 매 마일스톤 완료 시 업데이트됩니다. 최상단이 항상 최신 상태.

---

## 🧭 현재 상태

- **브랜치**: `claude/inventory-management-system-UBtbx`
- **작업자**: Claude (Opus 4.7)
- **기반 플랜 문서**: `/root/.claude/plans/1-lively-newt.md` (세션 로컬)
- **사본**: 본 파일의 "플랜 요약" 섹션 참고

---

## 📋 마일스톤 체크리스트

| M    | 항목                                | 상태   | 커밋 |
| ---- | ----------------------------------- | ------ | ---- |
| M1   | 데이터 모델 확장 + 신규 테이블      | ✅     | `M1 (git log 참조)` |
| M2   | 코드 체계 서비스 + 라우터           | ✅     | M2 (git log 참조) |
| M3   | Pending/Available 분리              | ✅     | M3 (git log 참조) |
| M4   | Queue 배치 (생산/분해/반품)         | ✅     | M4 (git log 참조) |
| M5   | Scrap / Loss / Variance             | ✅     | M5 (git log 참조) |
| M6   | 안전재고 알림 + 실사                | ⬜     | -    |
| M7   | 프론트 UX                           | ⬜     | -    |

상태 범례: ⬜ 대기 / 🟨 진행 중 / ✅ 완료 / ⚠️ 차단

---

## 🪵 마일스톤 로그

#### M1 — 데이터 모델 확장 (2026-04-17)

**변경 파일**
- `backend/app/models.py` — enum 4종 추가, 테이블 9종 신규, 기존 테이블 3개 확장
- `backend/app/main.py` — `run_migrations()` 에 ALTER 구문 추가, `ensure_reference_data()`에 코드 마스터 seed 추가

**추가된 테이블 (9)**
- `product_symbols` (100-slot, 1~5 배정: DX3000=sym3, COCOON=7, SOLO=8, ADX4000W=4, ADX6000FB=6)
- `option_codes` (BG/WM/SV)
- `process_types` (11개: TR/TA/HR/HA/VR/VA/NA/AR/AA/PR/PA)
- `process_flow_rules` (6개 흐름: TR→TA, TA+HR→HA, HA+VR→VA, VA→NA, NA+AR→AA, AA+PR→PA)
- `queue_batches`, `queue_lines` (Pending/배치 예약 구조)
- `scrap_logs`, `loss_logs`, `variance_logs`
- `stock_alerts`, `physical_counts`

**확장된 컬럼**
- `items`: erp_code(UNIQUE), symbol_slot, process_type_code, option_code, serial_no
- `inventory`: pending_quantity(default 0), last_reserver_employee_id, last_reserver_name
- `transaction_logs`: batch_id (QueueBatch FK)

**추가된 enum 값**
- `TransactionTypeEnum`: SCRAP, LOSS, DISASSEMBLE, RETURN, RESERVE, RESERVE_RELEASE
- 신규: `QueueBatchTypeEnum`, `QueueBatchStatusEnum`, `QueueLineDirectionEnum`, `AlertKindEnum`

**검증**
- 빈 DB: `Base.metadata.create_all` 후 19개 테이블 모두 생성 확인
- 기존 DB: 레거시 3개 테이블에 ALTER 구문 누락 없이 신규 컬럼 적용 확인
- seed: 100 symbols, 3 options, 11 process types, 6 flow rules 모두 정상 삽입

**커밋**: `M1 (git log 참조)` — push: origin/claude/inventory-management-system-UBtbx

#### M2 — 코드 체계 서비스 + 라우터 (2026-04-17)

**변경 파일**
- `backend/app/services/__init__.py` (신규)
- `backend/app/services/codes.py` (신규) — `ErpCode` dataclass, parse/format/validate/generate
- `backend/app/routers/codes.py` (신규) — `/api/codes` 라우터
- `backend/app/schemas.py` — 코드 마스터/코드 연산 응답 스키마 7종 추가
- `backend/app/main.py` — 라우터 등록

**API 엔드포인트**
- `GET /api/codes/symbols` — 100슬롯 제품기호 조회
- `PUT /api/codes/symbols/{slot}` — 슬롯 배정/수정 (uniqueness 검증)
- `GET /api/codes/options` — BG/WM/SV 옵션 조회
- `GET /api/codes/process-types` — 11개 공정 코드 (stage_order 정렬)
- `GET /api/codes/process-flows` — 6개 흐름 규칙
- `POST /api/codes/parse` — 4-파트 코드 파싱 + 검증. compact/zero-padded 모두 허용
- `POST /api/codes/generate` — symbol + process + option → 자동 serial 발번

**검증**
- 정상: `3-PA-0012-BG`, `3-PA-12-BG`, `376-TR-0001` 모두 파싱 성공
- 오류 검출: `376-PA-*` → PA 단일슬롯 위반, `3-PA-*-XX` → 미정의 옵션, `9-PA-*` → 예약 슬롯
- `format_erp_code(compact=True)` → 앞 0 제거 확인 (`3-PA-0001-WM` → `3-PA-1-WM`)

**커밋**: M2 (git log 참조)

#### M3 — Pending/Available 분리 (2026-04-17)

**변경 파일**
- `backend/app/services/inventory.py` (신규) — reserve / release / consume_pending / receive_confirmed 헬퍼
- `backend/app/schemas.py` — InventoryResponse, ItemWithInventory, ItemResponse에 pending/available/reserver/erp_code 노출
- `backend/app/routers/inventory.py` — `_to_response()` 헬퍼 도입, 모든 /receive /ship /adjust /ship-package 응답 통일, ship 검증을 available 기준으로 전환
- `backend/app/routers/items.py` — `_to_item_with_inventory()` 헬퍼 도입, list/detail 응답 통일
- `backend/app/routers/production.py` — BOM 체크 및 receipt를 available 기준으로 전환, 체크 응답에 pending/available 추가

**구현 원칙**
- `Total = Available + Pending` (invariant)
- Reserve 시 Available → Pending 이동, 점유자(last_reserver_name) 노출
- Confirm 시 `consume_pending`으로 Total과 Pending 동시 차감
- 단순 ship 출고도 available 기준으로 검증 (Pending 수량은 점유자 우선)

**검증**
- receive 100 → reserve 30 (by 김철수) → list에 available=70, pending=30
- ship 80 요청 → 422 (available=70), ship 50 성공 → total=50, pending=30, available=20
- item detail도 동일 숫자 + reserver='김철수' 표시
- release 30 → pending=0; consume_pending 20 → total-20, pending-20 동시 차감 확인

**커밋**: M3 (git log 참조)

#### M4 — Queue 배치 (생산/분해/반품) (2026-04-17)

**변경 파일**
- `backend/app/services/bom.py` (신규) — `explode_bom` / `merge_requirements` / `direct_children` 유틸. production.py가 쓰던 재귀 로직을 서비스 레이어로 이동.
- `backend/app/services/queue.py` (신규) — 배치 생명주기(`create_batch`/`override_line_quantity`/`toggle_line`/`add_line`/`remove_line`/`confirm_batch`/`cancel_batch`). PRODUCE/DISASSEMBLE/RETURN 3종 타입 지원.
- `backend/app/routers/queue.py` (신규) — `/api/queue` REST 라우터 (생성/목록/상세/라인 CRUD/confirm/cancel, 총 9개 엔드포인트).
- `backend/app/routers/production.py` — `_explode_bom`을 `services/bom.py` 위임으로 축소.
- `backend/app/schemas.py` — Queue 요청/응답 6종 추가 (`QueueBatchCreateRequest`, `QueueLineOverrideRequest`, `QueueLineToggleRequest`, `QueueLineAddRequest`, `QueueLineResponse`, `QueueBatchResponse`).
- `backend/app/main.py` — queue 라우터 등록.

**구현 원칙**
- **PRODUCE**: 상위 품목의 BOM을 leaf까지 재귀 전개 → 자식 품목을 OUT 라인(즉시 Pending 예약), 상위 품목을 IN 라인(예약 없음). Confirm 시 OUT은 Pending/Total 동시 차감, IN은 Total 증가.
- **DISASSEMBLE**: 상위 품목을 OUT(Pending 예약), 직접 자식을 IN(예약 없음)으로 시드. 사용자는 `toggle_line`으로 자식을 SCRAP/LOSS로 재분류하거나 `add_line`으로 수동 추가 가능.
- **RETURN**: 상위 품목 IN + 직접 자식들 IN으로 시드. 누락된 부품은 `toggle_line(..., new_direction=LOSS)`로 표시 → Confirm 시 LossLog만 생성 (재고 변동 없음).
- **Variance 로그**: Confirm 시 `bom_expected ≠ quantity`인 included 라인마다 `variance_logs` 레코드 생성. 제외된 라인은 `actual_used=0`으로 diff 기록.
- **TransactionLog**: 모든 Confirm 시 `batch_id` FK 심음. 추적/회계 연동 기반.
- **Cancel**: OPEN 상태에서만 가능. OUT 라인 Pending을 즉시 해제 → Available 복구.

**API 엔드포인트 (9)**
- `POST /api/queue` — 배치 생성 (OPEN, BOM 자동 로드)
- `GET /api/queue?status=OPEN` — 목록 + 점유자
- `GET /api/queue/{id}` — 상세
- `PUT /api/queue/{id}/lines/{lid}` — 수량 Override (Pending 증감 자동 반영)
- `POST /api/queue/{id}/lines/{lid}/toggle` — 포함/제외 + direction 재분류
- `POST /api/queue/{id}/lines` — 수동 라인 추가 (SCRAP/LOSS/IN/OUT)
- `DELETE /api/queue/{id}/lines/{lid}` — 라인 제거 (Pending 롤백 포함)
- `POST /api/queue/{id}/confirm` — 원자 커밋
- `POST /api/queue/{id}/cancel` — OPEN 상태 취소

**검증** (TestClient 기반, 임시 SQLite DB)
- **PRODUCE lifecycle**: 100/100 재고 + BOM(2/3) 상위 5개 생산 요청 → Pending 10/15 예약 → Override 10→8 → Confirm → Total 92/85, 상위 0→5, Pending 0/0.
- **CANCEL**: 생성 직후 취소 → Pending 0/0 복귀.
- **DISASSEMBLE with LOSS**: 상위 5개 중 2개 분해, 자식 C1은 IN 유지, C2는 LOSS로 전환 → 상위 5→3, C1 92→96, C2 불변, LossLog 1건.
- **RETURN with LOSS**: 반품 1개 + C2 누락 LOSS → 상위 3→4, C1 96→98, C2 불변, LossLog 누적.
- 최종: TransactionLog 9, LossLog 2, VarianceLog 1 (override 8 vs expected 10).

**커밋**: M4 (git log 참조)

#### M5 — Scrap / Loss / Variance 라우터 (2026-04-17)

**변경 파일**
- `backend/app/routers/scrap.py` (신규) — `POST /api/scrap`(재고 차감 포함), `GET /api/scrap`
- `backend/app/routers/loss.py` (신규) — `POST /api/loss?deduct=bool`, `GET /api/loss`
- `backend/app/routers/variance.py` (신규) — `GET /api/variance` (읽기 전용)
- `backend/app/schemas.py` — 7종 스키마 추가 (Scrap/Loss/Variance 요청·응답)
- `backend/app/main.py` — 3개 라우터 등록

**구현 원칙**
- **SCRAP**: 재고 available에서 차감 → ScrapLog + TransactionLog(SCRAP) 동시 기록. 422 if 부족.
- **LOSS**: 기본은 **기록만** (반품 누락처럼 애초에 재고에 없던 경우). `?deduct=true`로 available 차감 함께 수행.
- **VARIANCE**: Queue confirm 시 자동 생성된 로그를 조회. 배치별/품목별 필터.
- 모두 `batch_id` 필터 지원 → 배치 사후 분석에서 한 배치의 scrap/loss/variance 조회 가능.

**API 엔드포인트 (5)**
- `POST /api/scrap` — 수동 폐기 + 재고 차감
- `GET /api/scrap?item_id&batch_id` — 조회
- `POST /api/loss?deduct=bool` — 분실 기록 (± 재고 차감)
- `GET /api/loss?item_id&batch_id` — 조회
- `GET /api/variance?item_id&batch_id` — 조회

**검증**
- Scrap 3개 → 재고 50→47, Over-scrap 100 → 422
- Loss 5개 (deduct=false) → 재고 47 유지 / Loss 2개 (deduct=true) → 재고 47→45
- Queue PRODUCE 확정 시 override 8 vs expected 10 → variance_logs diff=-2 자동 기록
- List 필터 (item_id/batch_id) 정상 작동

**커밋**: M5 (git log 참조)

---

## 🎯 플랜 요약 (9개 요구사항)

1. **제품 코드 체계** `[제품기호]-[구분코드]-[일련번호]-[옵션코드]`
   - 예: `376-TR-0012-BG`, `3-PA-0012-WM`
   - 표시 시 앞 0 숨김(compact)
2. **100-슬롯 제품기호**: 1=DX3000(3), 2=COCOON(7), 3=SOLO(8), 4=ADX4000W(4), 5=ADX6000FB(6), 6~100 예약
   - 원칙: PA/AA 완제품·최종 조립체는 단일 슬롯 번호만 사용
3. **2-char 공정/성격 코드**
   - 앞글자(공정): T/H/V/N/A/P
   - 뒷글자(성격): R(Raw) / A(Assembly)
   - 흐름: TR→TA, TA+HR→HA, HA+VR→VA, VA→NA, NA+AR→AA, AA+PR→PA
4. **Pending/Available 분리**: Total = Available + Pending
   - 대기열 추가 시 Available→Pending, 확정 시 Pending 제거 + Total 차감
   - 점유자 실시간 공개(타임아웃 없음)
5. **Queue 배치 + BOM Override + 선별 입고**
6. **Scrap(폐기) / Loss(분실) / Variance 로그**
7. **옵션 코드**: BG/WM/SV (2자 index)
8. **시나리오**: 조립 시작(AA) / PA 부분 반품 / VA 분해 선별 입고
9. **고급 재고**: 안전재고 알림, Scrap 이력, 실사/강제 조정, ledger

---

## 🔑 핵심 설계 결정

1. **코드 공존**: 기존 `items.item_code`는 보존, 새 `items.erp_code` 컬럼 추가 (UNIQUE, nullable)
2. **Queue 범위**: 생산(AA/PA 수취), 분해, 반품에만 2단계 Queue→Confirm 적용 (단순 원자재 입출고는 기존 즉시 커밋 유지)
3. **백엔드 구조**: 서비스 레이어(`backend/app/services/`) 신설, 라우터는 얇게

---

## 📁 수정 대상 주요 파일

**백엔드**
- `backend/app/models.py` — 테이블 확장
- `backend/app/schemas.py` — 응답 필드 추가
- `backend/app/main.py` — 신규 라우터 등록
- `backend/app/routers/{inventory,production,bom}.py` — 위임/응답 확장
- `backend/app/routers/{codes,queue,scrap,loss,alerts,counts}.py` — 신규
- `backend/app/services/{codes,queue,bom,inventory}.py` — 신규
- `backend/seed.py` — 기본 데이터

**프론트엔드**
- `frontend/lib/api.ts` — 타입/메서드
- `frontend/app/legacy/_components/{InventoryTab,ItemDetailSheet,AdminTab,DesktopInventoryView,legacyUi}.tsx` — 연동
- `frontend/app/legacy/_components/{QueueBatchSheet,ReservationBadge,AlertsBanner,PhysicalCountSheet}.tsx` — 신규
- `frontend/app/{queue,alerts,counts}/page.tsx` — 신규 라우트

---

## 🚦 커밋 규칙

- 마일스톤 단위로 1커밋 1푸시
- 메시지 형식: `M{n}: {요약}` 예: `M1: 데이터 모델 확장 (Pending/Queue/Scrap)`
- 브랜치: `claude/inventory-management-system-UBtbx`

---

## 🔎 다음 작업 진입점 (Codex용)

새 세션 시작 시:
1. 이 파일 상단의 체크리스트에서 ⬜ 첫 항목 확인
2. 해당 섹션(아래 "마일스톤 로그")의 직전 완료 항목 확인
3. 플랜 문서의 해당 마일스톤 섹션 읽기 (없으면 이 파일의 "플랜 요약" 참고)
4. 작업 → 검증 → 커밋 → 푸시 → 이 파일 갱신
