# 용어 사전 (GLOSSARY)

이 문서는 ERP/MES 프로토타입에서 코드·UI·문서가 같은 의미로 쓰는 도메인 용어를 한 곳에 정리한다. 새로운 작업자/문서/기능은 여기 있는 단어를 그대로 사용한다.

## 부서 / 분류

| 한국어 | 코드 / 영문 | 설명 |
|---|---|---|
| 창고 | `WAREHOUSE` | 자재 보관 부서. 재고의 1차 위치. |
| 출하부 | `SHIPPING` | 출하 직전 재고를 모아 두는 부서. 출고는 항상 출하부에서. |
| 튜브 / 고압 / 진공 / 튜닝 / 조립 | (그대로) | 생산 부서. 카테고리 코드와 다름. |
| process_type_code | `process_type_code` | 품목 마스터의 부서 분류 (예: "조립", "고압"). |
| department | `Department` | 백엔드 enum. UI 부서 필터·이동/불량/반품에서 사용. |

부서 필터는 `process_type_code` 또는 `department` 둘 다로 동작 — "전체"와 "모든 부서/모델 개별 선택"은 동일한 결과여야 한다.

## 카테고리 (`CategoryEnum`)

| 코드 | 명칭 | 설명 |
|---|---|---|
| `RM` | Raw Material | 원자재 |
| `TA` | Tube Ass'y | 튜브 반제품 |
| `TF` | Tube Final | 튜브 완제품 |
| `HA` | High-voltage Ass'y | 고압 반제품 |
| `HF` | High-voltage Final | 고압 완제품 |
| `VA` | Vacuum Ass'y | 진공 반제품 |
| `VF` | Vacuum Final | 진공 완제품 |
| `BA` | Body Ass'y | 조립 반제품 (브라켓) |
| `AF` | Assembly Final | 조립 완제품. **`BF` 는 폐기** — 절대 사용 금지. |
| `FG` | Finished Good | 완제품 |
| `UK` | Unknown | 미분류 (확인 필요) |

## 재고 3-bucket 모델

`stock_math.StockFigures` 가 정의하는 단일 소스. 다른 어디에도 직접 계산 금지.

| 용어 | 코드 | 의미 |
|---|---|---|
| 창고 재고 | `warehouse_qty` | `Inventory.warehouse_qty`. 창고 부서가 보유한 분량. |
| 생산 합계 | `production_total` | 부서별 `InventoryLocation` 의 `PRODUCTION` 상태 합계. |
| 불량 합계 | `defective_total` | 부서별 `InventoryLocation` 의 `DEFECTIVE` 상태 합계. |
| 보류 | `pending` | `Inventory.pending_quantity`. OUT 큐에서 예약 중. |
| 총재고 | `total` | `warehouse + production + defective` (= `Inventory.quantity` 와 같아야 함). |
| 가용 | `available` | `warehouse + production - pending`. UI 가 보여주는 사용 가능량. |
| 창고 가용 | `warehouse_available` | `warehouse - pending`. **BOM backflush·창고 출고 검사용**. |

## BOM

| 용어 | 코드 | 설명 |
|---|---|---|
| 부모 / 자식 | `parent_item_id` / `child_item_id` | BOM 한 줄. parent 1개당 child 여러 개. |
| 트리 | `BOMTreeNode` | 다단계 전개 결과 (재귀). `_explode_bom`. |
| Backflush | `TransactionTypeEnum.BACKFLUSH` | 생산 입고 시 BOM 자식들을 자동 차감하는 동작. |
| Where-Used | `/api/bom/where-used/{item_id}` | 역방향 추적. 이 자식이 어떤 parent 들에 들어가는지. (Phase 4 추가) |

## 패키지 (출하 묶음)

| 용어 | 코드 | 설명 |
|---|---|---|
| 패키지 | `ShipPackage` | 출하용 품목 묶음. BOM 과 별개. |
| 패키지 출고 | `/api/inventory/ship-package` | 묶음 1건당 구성품을 한 번에 차감. 부족 시 `STOCK_SHORTAGE` 422. |

## 트랜잭션

| 코드 | 의미 |
|---|---|
| `RECEIVE` | 입고 (창고로) |
| `SHIP` | 출고 (출하부에서) |
| `PRODUCE` | 생산 입고 (대상 품목) |
| `BACKFLUSH` | 생산에 따른 자동 차감 (자재 품목) |
| `ADJUST` | 재고 조정 (창고만) |
| `TRANSFER_TO_PROD` / `TRANSFER_TO_WH` | 창고 ↔ 부서 이동 |
| `TRANSFER_DEPT` | 부서 ↔ 부서 이동 |
| `MARK_DEFECTIVE` | 불량 격리 |
| `SUPPLIER_RETURN` | 공급업체 반품 |

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

- **wizard**: 입출고 화면의 5단계 흐름 (담당자 → 작업유형 → 품목 → 수량 → 실행).
- **Topbar pill**: 화면 상단의 상태 알림 작은 알약 (정상/주의/실패).
- **completionFlyout**: 입출고 직후 0.38s in / 1.1s 표시 / 0.38s out 애니메이션.
- **ResultModal**: 부분 성공/실패 결과 다이얼로그. `partial` / `fail` / `success` 변형.
- **selectedItems**: `Map<string, number>` (item_id → 수량). 구조 변경 금지.
