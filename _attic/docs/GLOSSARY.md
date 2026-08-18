# 용어 사전 (GLOSSARY)

이 문서는 DEXCOWIN MES 에서 코드·UI·문서가 같은 의미로 쓰는 도메인 용어를 한 곳에 정리한다.
새로운 작업자/문서/기능은 여기 있는 단어를 그대로 사용한다.

> 프론트엔드 화면 라벨의 단일 소스는 [`frontend/lib/io/glossary.ts`](../../frontend/lib/io/glossary.ts)다.
> 본 문서는 사람용 사전, 위 모듈은 코드용 사전 — 두 곳이 일치해야 한다.

## 부서 / 분류

| 한국어 | 코드 / 영문 | 설명 |
|---|---|---|
| 창고 | `WAREHOUSE` | 자재 보관 부서. 재고의 1차 위치. |
| 출하부 | `SHIPPING` | 출하 공정 부서. 창고 재고와 별도 bucket이며, 외부 출하는 창고에서 차감될 수 있다. |
| 튜브 / 고압 / 진공 / 튜닝 / 조립 | (그대로) | 생산 부서. 카테고리 코드와 다름. |
| process_type_code | `process_type_code` | 품목 마스터의 부서 분류 (예: "조립", "고압"). |
| department | `Department` | 백엔드 enum. UI 부서 필터·이동/불량/반품에서 사용. |

부서 필터는 `process_type_code` 또는 `department` 둘 다로 동작 — "전체"와 "모든 부서/모델 개별 선택"은 동일한 결과여야 한다.

## 공정코드 (`process_type_code`)

품목 분류의 단일 기준. `{부서 계열 1글자}{단계 1글자}` 형식이며, 현재 구성은 `python _attic/backend-scripts/facts.py`로 확인한다.

| 부서 | R (원자재) | A (조립체) | F (F타입) |
|---|---|---|---|
| 튜브 | `TR` | `TA` | `TF` |
| 고압 | `HR` | `HA` | `HF` |
| 진공 | `VR` | `VA` | `VF` |
| 튜닝 | `NR` | `NA` | `NF` |
| 조립 | `AR` | `AA` | `AF` |
| 출하 | `PR` | `PA` | `PF` |

- `CategoryEnum` (`RM`/`TA`/`TF`/`HA`/`HF`/`VA`/`VF`/`AA`/`AF`/`FG`/`UK`) 은 2026-04-29 완전 제거. 코드·DB·UI 어디에도 존재하지 않는다.
- suffix 의미: `R` = 원자재, `A` = 조립/가공, `F` = 완성/출하형.

## 재고 3-bucket 모델

`stock_math.StockFigures` 가 정의하는 단일 소스. 다른 어디에도 직접 계산 금지.

| 용어 | 코드 | 의미 |
|---|---|---|
| 창고 재고 | `warehouse_qty` | `Inventory.warehouse_qty`. 창고 부서가 보유한 분량. |
| 생산 합계 | `production_total` | 부서별 `InventoryLocation` 의 `PRODUCTION` 상태 합계. |
| 불량 합계 | `defective_total` | 부서별 `InventoryLocation` 의 `DEFECTIVE` 상태 합계. |
| 창고 보류 | `pending` | `Inventory.pending_quantity`. 창고 OUT 큐에서 예약 중. |
| 부서 보류 | `department_pending` | 생산·불량 `InventoryLocation.pending_quantity` 합계. 부서 OUT 큐에서 예약 중. |
| 총재고 | `total` | `warehouse + production + defective` (= `Inventory.quantity` 와 같아야 함). |
| 가용 | `available` | `(warehouse - 창고 pending) + (production - 생산 위치 pending)`. UI가 보여주는 사용 가능량. 불량은 제외. |
| 창고 가용 | `warehouse_available` | `warehouse - 창고 pending`. **BOM backflush·창고 출고 검사용**. |

## BOM

| 용어 | 코드 | 설명 |
|---|---|---|
| 부모 / 자식 | `parent_item_id` / `child_item_id` | BOM 한 줄. parent 1개당 child 여러 개. |
| 트리 | `BOMTreeNode` | 다단계 전개 결과 (재귀). `_explode_bom`. |
| Backflush | `TransactionTypeEnum.BACKFLUSH` | 생산 입고 시 BOM 자식들을 자동 차감하는 동작. |
| Where-Used | `/api/bom/where-used/{item_id}` | 역방향 추적. 이 자식이 어떤 parent 들에 들어가는지. (Phase 4 추가) |

## 트랜잭션

| 코드 | 화면 라벨 | 의미 |
|---|---|---|
| `RECEIVE` | 원자재 입고 | 입고 (창고로) |
| `SHIP` | 출고 (PF + 창고 out 이면 "출하" — 아래 [출하 규칙](#출하-규칙) 참고) | 출고 |
| `INTERNAL_USE` | AS·연구 사용출고 | 창고 결재 승인 시 AS·연구 사내 사용으로 차감 |
| `PRODUCE` | 생산 | 생산 입고 (대상 품목) |
| `DISASSEMBLE` | 분해 *(이전 "재작업" — P0-1 통일)* | 부서 내 분해/회수 |
| `BACKFLUSH` | 자동 차감 | 생산에 따른 자동 차감 (자재 품목) |
| `ADJUST` | 수량 조정 | 재고 조정 (창고만) |
| `TRANSFER_TO_PROD` | 창고 → 부서 | 창고 → 부서 이동 |
| `TRANSFER_TO_WH` | 부서 → 창고 | 부서 → 창고 이동 |
| `TRANSFER_DEPT` | 부서 → 부서 | 부서 ↔ 부서 이동 |
| `MARK_DEFECTIVE` | 새 불량 *(이전 "새 격리")* | 불량 격리 |
| `UNMARK_DEFECTIVE` | 불량 해제 *(이전 "격리 해제")* | 정상 복귀 |
| `DEFECT_SCRAP` | 불량 처리 *(이전 "폐기")* | 격리 재고 폐기 |
| `SUPPLIER_RETURN` | 원자재 반품 | 공급사 반품 |

## 출하 규칙

입출고의 **출하** 표시는 별도 work type이 아니다.

입출고 V2 compose의 현재 work type과 sub type 라벨은 `frontend/lib/io/glossary.ts`를 정본으로 확인한다.

`internal_use` 는 AS·연구 부서와 창고 정/부만 접근한다. 사용 부서로 `AS` 또는 `연구`를
선택하면 창고 정/부 결재를 요청하고, 승인 시 창고 재고만 차감하며 부서 재고는 생성하지
않는다. 이력은 각각 `AS 반출`, `연구소 반출`로 표시하며 취소하면 해당 작업 배치의 수량을
창고로 복구한다.

| 조건 | 화면 표시 |
|---|---|
| `transaction_type=SHIP` + 품목 `process_type_code ∈ {PR, PA, PF}` + `warehouse → none(외부)` | **"출하"** |
| 그 외 SHIP | "출고" |

사이드바 **출하** 탭은 위 분류와 다른 전용 workflow다. `ShippingRequest`를 생성하고 요청·준비·픽업 완료를 관리하며, 픽업 완료 시 연결된 출하 차감을 만든다. 따라서 전용 workflow를 V2 `ship` work type으로 추가하지 않는다.

입출고에서 PF 계열 품목을 창고에서 외부로 `SHIP` 처리하면 이력은 출하로 분류된다. 전용 출하 업무는 사이드바 출하 탭에서 처리한다.

## 단일 사전 (코드)

화면 라벨은 [`frontend/lib/io/glossary.ts`](../../frontend/lib/io/glossary.ts)가 코드용 단일 소스다. 새 라벨 추가/변경 시 위 표와 해당 모듈을 함께 갱신한다. drift 방지 단위 테스트: [`frontend/lib/io/__tests__/glossary.test.ts`](../../frontend/lib/io/__tests__/glossary.test.ts).

## 에러 코드 (Phase 4 표준화)

`backend/app/routers/_errors.py:ErrorCode` 가 단일 소스.

| 코드 | HTTP | 의미 |
|---|---|---|
| `STOCK_SHORTAGE` | 422 | 재고 부족. `extra.shortages: list[str]`. |
| `EXPORT_RANGE_REQUIRED` | 400 | export 에 `start_date` / `end_date` 누락. |
| `EXPORT_RANGE_TOO_LARGE` | 422 | export 행 수가 50,000 초과. |
| `VALIDATION_ERROR` | 422 | 서비스 ValueError 일반. |
| `DB_INTEGRITY` | 409 | SQLAlchemy IntegrityError. |
| `DB_UNAVAILABLE` | 503 | OperationalError. |
| `INTERNAL` | 500 | 그 외 unhandled. `extra.request_id` 포함. |

프론트는 `lib/api.ts:extractErrorMessage(detail)` 가 str detail 과 위 dict 모양을 모두 처리한다.

## 그 외 용어

- **wizard**: 입출고 화면의 단계 흐름. 현재 단계명과 진행 조건은 `_warehouse_v2/useIoWorkState.ts`의 `IO_STEP_LABELS`와 `canAdvance`를 정본으로 확인한다.
- **Topbar pill**: 화면 상단의 상태 알림 작은 알약 (정상/주의/실패).
- **completionFlyout**: 입출고 직후 0.38s in / 1.1s 표시 / 0.38s out 애니메이션.
- **ResultModal**: 부분 성공/실패 결과 다이얼로그. `partial` / `fail` / `success` 변형.
- **selectedItems**: `Map<string, number>` (item_id → 수량). 구조 변경 금지.
