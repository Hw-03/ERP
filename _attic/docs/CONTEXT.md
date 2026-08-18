# DEXCOWIN MES — 도메인 컨텍스트

신규 개발자/AI 가 코드를 보기 전에 도메인을 머리에 넣을 수 있도록 한 문서.
상세 코드 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 용어는 [GLOSSARY.md](GLOSSARY.md),
결정 기록은 [adr/](adr/).

## 무엇을 만드는 회사인가

DEXCOWIN — 정밀 X-Ray 장비 제조사. 제조 흐름은 부서 계열과 R/A/F 단계의 `process_type_code`로
분류한다. 현재 공정·모델·품목 기준정보는 `python _attic/backend-scripts/facts.py` 또는 관련 API를
정본으로 확인한다.

## 조직

```
생산부 (parent)
 ├ 튜브 / 고압 / 진공 / 튜닝 / 조립 / 출하    ← "라인" (별도 부서장 없음)
영업부 / 연구부 / A/S부 / 기타 (단독)
창고 (= 자재창고. 부서 enum 에는 없음, Inventory.warehouse_qty 가 그 역할)
```

**주의 — 생산 라인에는 개별 부서장이 없다.**
- 생산부 정/부 (현재 시드: 이필욱 / 김건호) 두 사람이 6라인 결재를 모두 처리한다.
- "자기 부서 부서장" 가정 금지. 정상 결재 경로는 (a) 생산부장 (b) 창고장 두 가지.

## 품목 (Item)

모든 품목은 다음을 갖는다: (전체 품목 수는 `facts.py` 참조)
- `process_type_code` (2글자) — 부서 계열 + R/A/F 단계 (예: `TR`, `AA`, `PF`). R=원자재 / A=중간공정 / F=공정완료
- `model_symbol` — **DB 저장 컬럼**. 선택된 모델 슬롯의 기호를 오름차순으로 연결한 문자열이다. `model_slots`는 DB 컬럼이 아니라 `mes_code` prefix에서 파생하는 표시값(`backend/app/utils/mes_code.py`의 `mes_code_to_model_slots`)이다. 슬롯·기호·모델명은 변경 가능하므로 `python _attic/backend-scripts/facts.py` 또는 `GET /api/models`를 정본으로 확인한다.
- `mes_code` — 모델기호+공정코드+일련번호 를 합친 품목코드(단일 기준). ※ `erp_code` 컬럼은 **없음**(과거 개념). `item_code → mes_code` 전면 리네임 완료(2026-06-01).

상세 규칙: [ITEM_CODE_RULES.md](ITEM_CODE_RULES.md), [GLOSSARY.md](GLOSSARY.md) "공정코드".

## 재고 (Inventory)

재고는 한 품목당 3개 bucket 으로 분해된다:
- **warehouse** — 자재창고 보관량 (`Inventory.warehouse_qty`)
- **production** — 부서별 PRODUCTION 상태 합계 (`InventoryLocation`)
- **defective** — 부서별 DEFECTIVE 상태 합계 (`InventoryLocation`)

총재고 = warehouse + production + defective. 이 불변식은 `services/inventory` 의 `_sync_total` 이
모든 재고 변경 경로에서 유지하고, `services/integrity.py` 가 on-demand 로 점검·복구한다.

## BOM

품목 간 부모-자식 관계. 다단계 전개.
- 생산(produce) 시 BOM 자식들이 자동 차감(BACKFLUSH)
- 분해(disassemble) 시 BOM 자식들이 자동 회수
- where-used 역추적 가능 (`/api/bom/where-used/{item_id}`)

## 입출고 (Io) — V2

현재 활성 입력 UI: `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx`.

작업 분기는 다음 work type으로 구성된다:
- **`receive`** — 원자재 입고 (창고 정/부만 가능)
- **`warehouse_io`** — 창고 ↔ 부서 (결재 필요한 흐름)
- **`warehouse_adjust`** — 창고 수량 보정 입출고
- **`process`** — 부서 내 작업 (생산/분해/수량보정)
- **`defect`** — 불량 격리/해제/처리/공급사 반품
- **`internal_use`** — AS·연구 사용출고 (AS·연구 또는 창고 정/부만 가능)

`internal_use` 는 사용 부서(AS/연구)를 선택한 뒤 창고 정/부 결재를 요청한다. 승인 시 창고
수량과 전체 재고만 차감하고 부서 재고는 만들지 않으며, 작업 취소 시 같은 작업 배치의 차감
수량을 창고로 복구한다. 품목 전환 메뉴와 실행 API는 조립·출하 부서만 사용할 수 있다.

입출고 이력의 **출하** 표시는 별도 work type이 아니라 `SHIP` 거래 중 `PR`·`PA`·`PF` 품목이
`warehouse → none(외부)`로 이동한 경우의 분류다. 반면 사이드바 **출하** 탭은
`ShippingRequest`를 요청·준비·픽업 완료까지 관리하는 전용 workflow다. 두 개념을 같은 UI 진입점이나
work type으로 취급하지 않는다.

### V2 wizard 상태 묶음

`_warehouse_v2/useIoWorkState.ts`가 현재 wizard의 상태 정본이다. 단계는 `작업 유형` → `세부 작업`
→ `대상 선택` → `실제 반영` → `제출 확인`이며, 상태 묶음은 `workType`·`subType`·출발/도착 부서·
`deptIoDirection`·`bundles`·메모·참조번호·현재 단계로 구성된다. `bundles`의 포함/제외 line, 부족 수량,
유효 수량이 다음 단계 진행을 결정한다. `process`와 `warehouse_adjust`는 세부 작업에서 입고/출고 방향을
선택해야 하며, `internal_use`는 도착 부서를 AS 또는 연구로 선택해야 한다.

## 결재 워크플로

- `warehouse_to_dept`, `dept_to_warehouse`, `internal_use_out` 흐름은 즉시 반영되지 않고 `StockRequest`
  로 변환되어 결재 큐에 들어간다.
- 결재자는 (a) 생산부장 (b) 창고장 둘 중 적절한 쪽.
- 비자기승인 요청은 출고 원천별로 재고를 예약한다. 창고 출고는 `Inventory.pending_quantity`,
  부서 생산·불량 출고는 해당 `InventoryLocation.pending_quantity`를 사용하며, 입고 전용 요청은
  예약 없이 `SUBMITTED` 상태로 대기한다.
- 최종 결재는 같은 트랜잭션에서 요청의 모든 source 예약을 한 번 해제한 뒤 실제 재고 변경과
  `TransactionLog` 기록을 수행한다. 반려·취소·승인 실패도 같은 source 예약을 해제한다.
- 요청자가 필요한 결재 권한을 모두 가진 자기승인 요청은 예약을 만들지 않고 즉시 실행한다.

## 모바일

`MobileIoComposeWizard` 는 데스크탑 V2 의 컴포넌트/hook 을 그대로 재사용한다
([ADR-0003](adr/ADR-0003-mobile-reuses-desktop-v2.md)). 비즈니스 규칙 drift 0.

## 화면 라벨 단일 소스

`frontend/lib/io/glossary.ts` — work/sub/transaction/request type 라벨이 한 곳에.
사람용 사전은 [GLOSSARY.md](GLOSSARY.md). drift 검사: `glossary.test.ts`
([ADR-0002](adr/ADR-0002-shared-io-glossary.md)).

## 동결 영역

- **주간보고 화면** — `_weekly_sections/`, `DesktopWeeklyReportView.tsx` (2026-05-24 동결)
- 주변 리팩터/전역 변경/이름 통일 작업에서 우회. 명시 요청 시에만 수정.

## 운영

- 백엔드: `scripts/dev/start-backend.ps1` (좀비 워커 정리 + /health/live 확인)
- 정합성 검사: `services/integrity.py` 의 mismatch 카운트 (`/health/detailed` 노출)
- 백업: `scripts/ops/backup_db.bat`

## 폴더·파일 명칭 가이드

이름이 실체를 오도하는 곳들 — **rename 대신 문서로 해소**(CLAUDE.md 대규모 rename 금지 규칙 준수).

| 이름 | 실제 | 주의 |
|---|---|---|
| `legacy_part`, `legacy_item_type` | Item 모델의 **현역 필드** | "legacy" 접두사는 historical 이유 — CSV 호환·검색용으로 의도 보존(CLAUDE.md 명시) |
| `routers/models.py` | 제품 모델(ProductSymbol) **라우터** | DB 모델은 `models/` 폴더 |
| `_warehouse_v2/` | 현재 활성 입출고 컴포넌트 | V1은 `_warehouse_sections/` 등에 분산(별도 V1 폴더 없음) |
| `services/inventory.py` | re-export 레이어(공개 API) | 실제 구현 위치는 `backend/app/services/`에서 import 경로를 따라 확인 |
| `services/io.py` | re-export 레이어 | 실제 구현 위치는 `backend/app/services/`에서 import 경로를 따라 확인 |
| `_archive/` (3곳) | 보관소(위치별 역할 상이) | `frontend/_archive`·`_attic/_archive`·`_attic/backend/_archive` |

**`_` 접두어 규칙(frontend):** `_<feature>_hooks`(훅)·`_<feature>_sections`(섹션 컴포넌트)·`_<feature>_steps`(단계 UI)·`_archive`(미사용). Next.js 라우팅에서 제외되는 프라이빗 폴더 관례.

## 더 알고 싶다면

- 폴더·레이어: [ARCHITECTURE.md](ARCHITECTURE.md)
- 엔티티 관계: [ERD.md](ERD.md)
- 용어집: [GLOSSARY.md](GLOSSARY.md)
- 결정 기록: [adr/README.md](adr/README.md)
- 운영: [OPERATIONS.md](OPERATIONS.md)
