# CP1 작업 예약 계약

기준: 격리 워크트리 `e55918bc12d854d2ce58ebf3b62e385cd4ff21e0`, 2026-10-20. 상위 계획: [작업 예약 실행 계획](2026-10-20-work-reservations.md).

이 문서는 CP3~CP6의 구현 계약이다. CP1에서 공용 TypeScript 타입·HTTP 호출·쿼리 키와 무효화 연결을 제공했고, CP3에서 저장 예약 모델·계산·명령을 추가했다. CP4에서 승인 이관·공개/관리자 조회·취소 API와 기존 작업 전환 도구를 구현했다. 실제 화면은 CP5·CP6 범위다. 아래 B 계열 사례의 실제 검증 상태는 상위 계획의 CP별 증거를 따른다.

## 1. 수량과 위치

물리 셀 키는 `(item_id, bucket, department)`다. 창고는 `warehouse/null`, 정상 부서는 `production/부서 코드`, 불량은 `defective/부서 코드`다. 같은 품목이라도 위치가 다르면 예약을 서로 대체하지 않는다.

| 값 | 확정 의미 |
|---|---|
| `Inventory.pending_quantity`, 기존 `Item.pending_quantity` | **창고** 작업 예약 + 창고 승인 예약. 부서·출하 예약을 합쳐 넣지 않는다 |
| `InventoryLocation.pending_quantity` | 그 위치의 작업 예약 + 승인 예약. 정상·불량 위치를 서로 합치지 않는다 |
| 기존 `department_pending_quantity` | 정상 + 불량 부서 위치의 pending 합계. 호환 의미를 보존한다 |
| `work_reserved_quantity` | 정상 재고를 잡은 활성 draft 원장 합계 |
| `approval_reserved_quantity` | 정상 재고를 잡은 활성 승인 예약 합계. 승인 수락 후 최종 정산을 기다리는 예약도 포함 |
| `shipping_reserved_quantity` | `ShippingAllocation.status=RESERVED` 정상 재고 합계. pending에 다시 포함하지 않는다 |
| `available_quantity` | 창고 + 정상 부서 실재고 − 그 위치의 작업·승인·출하 예약. 불량과 미래 입고 제외 |

기존 수식 근거: `backend/app/services/stock_math.py:11`, `:66`, `:76`; 셀 계산 `stock_availability.py:88`, `:173`. 현재 데이터에 음수 가용량이 있으면 숨기기 위해 0으로 보정하지 않는다. **신규 예약은 항상 위치별 전량 확보**하며, 기존 이상값을 더 악화시키지 않는다.

신규 `Item.work_reservations: InventoryReservationSummary` 안에 정상 재고 전체 예약 breakdown과 예정 합계를 둔다. 이름 충돌과 공간 범위 혼동을 피하기 위한 명시적 묶음이다. `reservation_by_location`은 같은 세 예약량을 셀별로 제공하고 `forecast_by_location`은 별도 배열이다. 예정만 있는 위치를 기존 `locations`에 실재고 0행으로 만들어 넣지 않는다.

`expected_in_quantity`/`expected_out_quantity`는 이동을 제외한 입고·생산/소비·출고의 **물리 수량**, `transfer_in_quantity`/`transfer_out_quantity`는 같은 품목 이동이다. 전역 물리 순증감은 `expected_in − expected_out`이며 이동은 0이다. 정상→불량 격리도 이동이고 전체 증가는 아니다. 불량 목적지의 예정은 해당 셀에 표시하며 정상 가용재고 증가로 표현하지 않는다. 다른 품목·단위 수량을 하나로 합산하지 않는다.

예약·효과 수량은 양의 정수이며, 공개 합계는 정수다. 입력 스키마의 정수 검증에 더해 **계산 결과도 DB 저장 전에 비정수를 거부**한다. 기존 `IntQuantity`는 `int(value)`로 절삭하므로 유효성 검사를 대신하지 못한다(`models/base.py:55`). float 오차나 임의 반올림을 추가하지 않는다. 출발과 도착이 같은 이동은 유효 작업으로 저장하지 않는다.

예시(전부 가상): 창고 10, 작업 3, 승인 2, 출하 1이면 가용 4다. 입고 예정 8을 추가해도 가용 4다. 자기 작업 3을 수정하는 미리보기에서만 가용 7이다. 창고→조립 2 이동은 창고 이동 예정 −2, 조립 +2, 전체 증가 0이다.

## 2. 서버 유효 계획과 저장 모델

`WorkEffectivePlan {version:1, fingerprint, effects[]}`를 서버가 생성한다. 각 효과는 `effect_id`, `operation_line_id`, `bundle_id`, 품목 식별, 양의 수량, `kind:in|out|move`, `from`, `to`다. 입력 source는 창고/정상 부서만, 목적지는 불량을 포함할 수 있다. `out`은 to=null, `in`은 from=null, `move`는 양쪽이 있다. 여러 원본 행의 같은 셀 투입은 예약할 때만 합치고 효과 식별은 보존한다.

1. 저장 요청을 복제해 품목·권한·업무별 검증, BOM 토큰 검증, 제외·면제, 커스텀 BOM, 자동 경로 정규화를 적용한다.
2. 그 결과로 유효 효과와 승인 분할 계획을 산출한다. 새 서비스는 이 계산 범위만 공유하며 기존 모든 입출고 서비스를 재작성하지 않는다.
3. 입력 필요량은 각 `out`/`move` 출발의 합계다. 동일 배치의 `in`이나 이동 도착을 출발 필요량에서 빼지 않는다.
4. 저장은 계획과 원장을 함께 보관한다. 제출·승인은 같은 계산으로 실제 효과를 재검증한다. 효과/위치/수량/승인 분할이 바뀌면 `WORK_PLAN_CHANGED`로 전체 롤백하고 재저장 또는 기존 요청 수정으로 돌아간다.
5. GET은 저장 snapshot을 그대로 읽는다. 최신 경로로 다시 계산하는 preview와 저장 사실을 섞지 않는다. `fingerprint`는 서버의 정규 직렬화된 효과·업무·승인 분할을 해시한 값이며 화면 이름·현재 부족량·휘발성 토큰은 제외한다.

현재 커스텀 BOM은 상위 참조행 제외(`io_dispatch.py:302`), 하위 방향 변환(`:410`)을 거쳐 실행한다. 단순 `IoLine` 복사나 화면 합산은 계약 위반이다. 지금 GET의 경로 정규화(`io_draft.py:58`)는 예약 snapshot 도입 시 응답 전용 preview로 분리해야 한다.

| 예정 DB 구조 | 제약/책임 |
|---|---|
| `IoBatch.revision` | 정수 ≥0. 신규 생성 1, 기존 배치는 구조 마이그레이션에서 0 |
| `IoBatch.reservation_status` | `reserved / needs_reservation / not_required / inactive` |
| `IoBatch.reservation_issue` | 사유 code/message/shortages JSON, 정상 상태는 null |
| `IoBatch.effective_plan` | 위 versioned snapshot JSON, 전환 전 과거 자료는 null |
| `IoBatch.creation_payload_hash` | 최초 생성 입력의 정규 hash. 수정 후에도 최초 값 보존 |
| `IoDraftReservation` | batch FK, item FK, 정규 위치 key, quantity>0. `(batch_id,item_id,location_key)` unique; 창고 null UNIQUE 차이를 피하도록 위치 key는 non-null |
| `IoWorkReservationEvent` | event ID, batch FK, action, revision, 발생 UTC, 검증된 actor ID 또는 null, actor 이름, 사유. 취소/전환 근거를 같은 트랜잭션에 보존 |

원장은 **현재 활성 예약만** 가진다. 해제 시 삭제하고 현재/종료 시점 계획과 변경 주체·시각·사유는 계획/이벤트로 보존한다. 이번 감사 범위는 취소·전환 근거이며 모든 과거 수정의 자재별 수량을 복원하는 이력 저장소는 추가하지 않는다. 원장 합과 pending 증감을 동일 트랜잭션에서 반영한다. 무결성 검사와 best-effort 승인 예약 해제의 보호 합계에 draft 원장을 추가한다(`inventory_integrity_engine.py:247`, `sr_reservation.py:104`, `:165`). 재고 저장/해제 자체는 물리 수량·재고 거래 로그를 바꾸지 않는다.

## 3. 상태·버전·중복 요청

`IoBatch.status`는 기존 workflow 상태를 유지한다. `reservation_status`는 **draft 예약 상태**다. 제출 후에는 `inactive`이고, 승인 예약은 StockRequest가 관리한다. UI가 `inactive`만 보고 연결 승인 예약을 0으로 판단하면 안 된다.

| 명령/결과 | 배치/예약 상태와 원장 | 버전 |
|---|---|---|
| 신규 저장, 입력 전량 확보 | draft/reserved, 모든 출발 원장 생성 | 1 |
| 유효한 투입 없는 입고 또는 재고 미반영 작업 저장 | draft/not_required, 원장 없음, 유효 효과만 예정 | 1 또는 +1 |
| 본인 수정 성공 | draft, 새 계획으로 기존/신규 예약 교체 | +1 |
| 부족·계획 불일치·버전 충돌·일반 실행 예외 | 내용/원장/물리/버전 모두 이전 상태 | 유지 |
| 승인 필요 제출 | submitted 또는 reserved/inactive, draft→승인 예약 원자 이관 | 명령 전체에서 +1 |
| 즉시 실행/자동 승인 완료 | completed/inactive, 예약 해제와 물리 반영 | 명령 전체에서 +1 |
| 연결 승인 일부 처리 | 기존 partial 상태 정책, 열린 요청 효과만 예정 | 변경 명령마다 +1 |
| 승인 요청 수정 | 연결 미결 승인 취소와 draft/reserved 또는 not_required 확보를 함께 처리 | +1 |
| 기존 자동 반려 복귀 | draft/needs_reservation, 원장/확정 예정 0 | +1 |
| 최종 반려/취소 | 기존 종료 status/inactive, 남은 예약 해제 | +1 |
| 관리자 취소/본인 삭제 | cancelled/inactive, 원장 해제, 이벤트와 생성 키 보존 | +1 |
| 기존 자료 전환 | 성공 reserved/not_required, 실패 needs_reservation+사유 | 실제 상태/계획/원장 변경 때 +1 |

자동 반려 복귀는 현행 process의 `adjust_in/adjust_out` 부서 결재에서만 일어난다(`io_persist.py:821`). 모든 반려를 draft로 바꾸지 않는다. 승인 요청 수정은 완료된 연결 요청이 있으면 거절하고 사용출고는 기존 수정 금지를 유지한다(`stock_request_actions.py:532`, `:554`).

**기존 사용출고 최종 정산 실패 예외:** `io_actions.py:24`는 실패 사실을 commit하며 `internal_use_approval.py:489`가 남은 예약을 해제한다. 이 흐름을 보존한다. 실패 기록이 확정된 경우 `failed/inactive`, 원장 0, revision +1, `IO_SETTLEMENT_FAILED_PERSISTED`와 `state_committed:true`를 반환한다. 일반 rollback 실패와 구분하며 재시도로 다시 실행하지 않는다. 이후 조회에서 실패 상태를 보여준다.

**기존 일반 승인 실패 확정:** `stock_request_actions.py:63`, `:103`의 `FailedApprovalError` 처리도 실행 트랜잭션을 롤백한 뒤 별도 트랜잭션에서 실패 요청/예약 해제를 기록한다. 이 이력은 보존하며 연결 배치는 남은 요청을 집계한 상태, reservation_status=inactive, revision +1이 된다. `WORK_APPROVAL_FAILED_PERSISTED`와 `state_committed:true`, request_id, batch_id, current_revision/current_status를 반환한다. 재기록 트랜잭션도 동일 잠금 순서를 따르고 **실행 시 읽은 revision/요청 상태가 그대로인지 재확인**한다. 사이에 다른 명령이 확정됐으면 덮어쓰거나 다시 해제하지 않고 충돌/현재 상태를 반환한다.

두 실패 확정 경계 모두 **계약 오류(WORK_PLAN_CHANGED, 버전/상태 충돌, 재고 부족, 권한 거부)**를 실패 이력으로 변환하지 않는다. 별도의 도메인 예외로 구분하고 `ValueError`/광범위 `Exception` → `FailedApprovalError` 변환보다 먼저 통과시켜 전체 롤백한다. 계획 불일치를 승인 실패로 확정해 기존 예약을 잃는 구현은 B14 실패다.

**사용출고 승인자 대체 이관:** 마지막 활성 AS·연구 승인자가 해제되면 기존 미결 요청을 부서 승인으로 넘기는 정책을 유지한다. roster→대상 배치 전체→연결 요청 전체를 정렬해 잠그고, 변경 전 계획을 재검증한다. 변경 후 물리 효과가 동일할 때만 승인 분할 fingerprint와 배치 revision을 갱신하고 system 이벤트에 사유를 기록한다. 이미 수락한 결정은 보존하며, 이관된 요청은 승인자 재활성화만으로 다시 AS 승인으로 돌아가지 않는다. 무관한 계획 변경이 발견되면 직원 권한 변경까지 롤백한다.

- 인증 후 배치를 잠그고 **소유권/명령 권한을 먼저 확인한 다음** `expected_revision`을 비교한다. 그 뒤 상태·유효 계획을 검증한다. 저장/삭제/제출/관리자 취소/요청 수정은 이 예상 버전이 필수다. 기존 일반 승인·반려·취소는 현행 요청 상태·승인 권한 guard를 잠금 아래 재검증하고 연결 배치 버전을 올리되, 별도 사용자 입력 버전을 새 필수조건으로 추가하지 않는다. 자동 승인처럼 내부 여러 함수가 변이를 일으켜도 외부 한 명령의 트랜잭션당 배치 버전은 한 번만 올린다.
- 기존 응답의 revision 누락은 0으로 추측하지 않는다. 새 서버 조회를 통해 실제 버전을 받아야 한다. CP1 타입의 optional은 구 화면 호환용이며 CP3 서버가 버전 누락 쓰기를 허용한다는 의미가 아니다.
- 신규 생성은 `client_request_id` 필수(기존 최대 64자), 최초 정규 입력 hash를 보존한다. 같은 key/소유자/최초 입력 재시도는 기존 배치의 **현재 상태**를 반환하고 재예약하지 않는다. 취소된 배치도 되살리지 않는다. 내용이 다르면 409, 다른 소유자는 403이며 배치 정보를 노출하지 않는다.
- 생성 hash는 명령 종류(draft 생성/direct submit)와 사용자 의도(업무·수량·위치 선택·제외·메모·사유·공급업체)를 포함하고 서버 발급 ID·토큰·부족량은 제외한다. 저장 업데이트의 멱등성 key로 생성 key를 재사용하지 않는다.
- 수정 응답 유실 후 같은 버전 요청은 409다. 입력은 유지하고 최신 상태를 읽는다. 새 버전으로 자동 재전송하지 않는다.
- 관리자 취소는 마지막 `admin_cancelled` 이벤트의 원래 버전/정규 사유가 동일한 재시도만 200 현재 상세로 응답한다. 권한 검증은 매번 한다. 다른 사유/오래된 변경은 409다. 재시도는 버전·해제·이벤트를 늘리지 않는다.
- 본인 삭제는 소프트 취소로 생성 키를 보존한다. 원래 owner/version의 같은 삭제 재시도는 204다. 존재하지 않는 ID의 기존 idempotent 204는 유지하고, 실제 존재하는 다른 소유자 배치를 지우는 우회로로 사용하지 않는다.
- 신규 direct `/api/io/submit`도 같은 계획·가용량/생성 키 검증을 거친다. `batch_id`가 있으면 무시해 새 작업을 만드는 현행 동작을 금지하고 기존 draft submit+revision 경로를 사용한다. 기존 draft key로 direct submit하면 상태 충돌이며 draft를 우회 실행하지 않는다.

## 4. 잠금과 트랜잭션

사용출고에서 필요한 승인자 roster advisory 잠금 → 변경 대상 배치 → 연결 StockRequest의 `request_id` 순 → 기존/신규 효과 품목 합집합의 item ID 순 Inventory 부모 → 물리 셀 순 → 필요한 활성 출하 allocation 순으로 잠근다. roster 잠금이 불필요한 명령은 그 단계만 생략한다. 이벤트/원장/효과 갱신까지 한 트랜잭션이다. 일반 승인 경로가 StockRequest를 먼저 잠근 뒤 배치를 잠그는 역순을 남기지 않는다. 연결 ID/업무 종류를 찾는 최초 읽기는 잠금 전 힌트일 뿐이며 잠금 후 다시 확인한다.

현재 inventory 부모 전역 순서 도구(`inventory.py:92`)를 재사용하고, 그 안의 실사 guard 하위 순서인 Control→Item→Inventory→Gate를 보존한다(`inv_base.py:146`, `stocktake_guard.py:47`). 출하 쪽에서도 부모 inventory 전에 allocation을 잠그는 역순이 없는지 CP3/CP7에서 함께 확인한다. 사용출고 `lock_and_refresh_employee`와 정산의 roster 잠금(`internal_use_approval.py:119`, `:390`)을 참여 명령 시작 시 먼저 확보해 배치→roster 역순을 없앤다. 재고가 없는 목적지를 조회 중 생성하지 않는다. 쓰기 때만 필요한 위치를 확보한다.

스냅샷 없는 기존 승인·batch 없는 요청도 첫 셀 잠금 전에 재작업의 부모와 자식, 부서 경로 판단에 필요한 결정 트리를 전부 선언한다. 부모만 먼저 선언해 실사 guard가 이후 자식 잠금 확장을 거부하는 회귀를 허용하지 않는다.

SQLite에서는 `FOR UPDATE`를 잠금 증거로 삼지 않는다. 기존 쓰기 엔진의 `BEGIN IMMEDIATE`(`database.py:83`)와 배치 revision/status 조건부 UPDATE(CAS), 셀별 충분 조건 UPDATE를 같은 트랜잭션에서 사용한다. PostgreSQL에서는 정렬된 행 잠금 및 `populate_existing` 재조회 후 같은 검증을 한다. SQLite 통과 결과와 PostgreSQL의 실제 경합 검증을 별도 보고한다. 명령 성공 전에 realtime revision을 먼저 외부에 발표하지 않는다.

`owner_batch_id`는 활성 직원·본인 draft를 확인한 preview에만 적용하고 **그 배치가 실제 원장에 가진 입력 예약만** 가산한다. 다른 배치/제출 배치에는 403/409다. `owner_request_id`는 기존 출하 예약 예외라서 재사용하지 않는다. 공개 dashboard는 어떤 소유자도 가산하지 않는다.

## 5. 예정량과 부분 완료

- draft: reserved/not_required + 유효 snapshot인 경우만 기대 효과를 제공한다. needs_reservation은 관련 작업 목록에서 이유를 보여주되 `reserved_inputs=[]`, `expected_effects=[]`다.
- 제출/부분 완료: 현재 `SUBMITTED/RESERVED` 요청과 대응 line의 효과만 포함한다. 현재 모델에는 수량 일부 완료 필드가 없으므로 요청 단위의 전체 line 처리이며 임의 비율 잔량을 만들지 않는다. 단순 batch.status 필터로 partially_completed 전체를 빼거나 완료한 라인을 다시 넣지 않는다.
- 승인 수락 사실과 실제 실행 완료를 구분한다. 사용출고는 승인 수락 후에도 최종 정산 전 RESERVED가 유지될 수 있으므로 이름이 ‘승인됨’이라고 예약/예정을 제거하지 않는다.
- `operation_line_id`로 snapshot 효과와 실제 승인 라인을 연결한다(`io_dispatch.py:195`). 현행 지원 작업에서 실제 효과는 하나의 operation_line_id에 속하고 현재 제출 회차의 실행 StockRequestLine 하나에 연결된다. 참조행은 효과 0개다. 과거 취소/반려 요청은 현재 매핑에서 제외한다. 현재 매핑 중복·누락은 해당 효과를 예정에서 제외하고 `missing_effect_mapping`으로 표시한다. 사용출고의 전체 결정 대기는 batch 정산 조건이지 하나의 효과가 여러 요청 line에 중복 연결되는 모델이 아니다.
- 이전 회차의 취소·반려 행으로 현재 회차의 누락 매핑을 정상 종료라고 판단하지 않는다. `submitted_at` 이후 생성된 요청만 현재 회차의 종료 근거로 삼고, 회차 시각이 없는 과거 자료는 완료 기록만 종료 근거로 인정한다. 실제 예약은 매핑 문제와 별개로 유지한다.
- `works`는 IoBatch에 연결된 자료만 포함한다. batch가 없는 독립/과거 StockRequest의 실제 정상 승인 예약은 summary에 포함하지만 IO 계획을 복원할 수 없는 예정은 제외하고 `forecast_complete=false`로 표시한다. 가짜 batch ID나 revision을 만들지 않는다. batch가 있는 과거 자료는 기존 planner의 순수 효과·경로 계산과 일괄 조회된 품목으로 읽기 전용 복원한다. 안전하게 복원할 수 없으면 `works[].forecast_issue`에 `missing_effect_mapping` 또는 `unsupported_legacy_plan`을 반환하고 합계도 `forecast_complete=false`로 표시한다. GET은 복원한 계획을 저장하지 않는다.
- CP4의 과거 자료 복원 범위는 `direct_item` 번들의 같은 품목 `direct` 행이며 BOM 표시·토큰이 없는 경우다. `warehouse_io`의 `warehouse_to_dept/dept_to_warehouse/dept_transfer`, `receive`의 `receive_supplier/outbound_supplier`, `tube_material`의 `tube_receive_supplier/tube_outbound_supplier`만 현재 품목·실제 승인 행과 대조한다. BOM·수동·process·internal_use 과거 자료는 정책을 추정하거나 행마다 DB를 조회하지 않고 예정 불완전으로 명시한다. 실제 예약량은 계속 집계한다. 각 지원 경로의 전체 planner 결과 일치와 과거 작업 수 증가 시 쿼리 수 불변을 테스트한다.
- 품목 목록은 페이지 item ID들로 원장/승인/출하/열린 효과를 일괄 집계한다. 행마다 추가 API/DB 질의를 만들지 않는다. 품목 0재고라도 열린 결과 효과가 있으면 기존 품목 목록/선택 상세의 예정에 나타난다.

## 6. HTTP 계약

JSON 필드 정본은 `frontend/lib/api/types/work-reservations.ts`, 재고 합계는 `types/inventory.ts`, 작성 명령은 `types/io.ts`다. 신규 DTO는 필수 필드와 명시적 null/빈 배열을 반환한다. 구 `Item`/`IoBatch` 확장은 CP1에서 optional로 두고 CP3~CP5 연동 완료 시 새 서버 응답을 기준으로 사용한다. 미제공 수치를 ‘예약 0’의 근거로 삼지 않는다.

| API | 입력/권한 | 성공 응답 |
|---|---|---|
| `POST /api/io/preview` | 기존 payload + `owner_batch_id?`, 있을 때 requester 필수·본인/상태 확인 | 기존 preview, 자기 원장 가산 부족량 |
| `PUT /api/io/draft` | 신규: client_request_id 필수; 수정: batch_id + expected_revision 필수. 본인 기존 권한 | 200 IoBatch + revision/status/issue/plan |
| `DELETE /api/io/draft/{id}` | query requester_employee_id + expected_revision, 본인 | 204, 소프트 취소 |
| `POST /api/io/draft/{id}/submit` | query requester_employee_id, body `{expected_revision}` | 기존 201 IoSubmitResponse, 배치 revision 포함 |
| `POST /api/io/submit` | 신규 작업만, client_request_id 필수 | 기존 201 응답. 기존 배치는 위 전용 경로 |
| `POST /api/stock-requests/{id}/revert-to-draft` | 기존 actor_employee_id/pin + expected_revision(연결 batch 버전) | IoBatch, 새 draft 예약 확보 |
| `GET /api/inventory/work-status?item_id=…` | 현행 사내 재고 일반 조회 범위. 관리자 PIN 불필요, 쓰기 불가 | `InventoryWorkStatus {item_id,summary,works}` |
| `GET /api/admin/work-reservations` | 모든 요청 관리자 PIN 검사 | `AdminWorkReservationList` |
| `GET /api/admin/work-reservations/{batch_id}` | 관리자 PIN | `AdminWorkReservationDetail` |
| `POST /api/admin/work-reservations/{batch_id}/cancel` | 관리자 PIN, `{expected_revision,reason}` | 200 최신 `AdminWorkReservationDetail` |

관리자 list 필터: `search`(담당자명·작업 종류/번호·대상 품목명/코드), `requester_department`, `requester_employee_id`, `reservation_status`, `owner_active`(true/false), `view=active|cancelled`(기본 active), `sort=updated_asc|updated_desc`(기본 asc), `skip>=0`(기본 0), `limit=1..100`(기본 50). 동일 시각이면 batch_id 오름차순으로 결정한다. 부서/이름은 배치의 담당자 스냅샷이며 active 여부만 직원 현재 상태다. 재고 출발 위치 필터로 해석하지 않는다.

active는 draft 전체, cancelled는 본인 삭제와 관리자 취소 기록이다. `total`은 모든 필터를 적용한 행 수다. `counts`는 **reservation_status만 제외하고 나머지 필터를 유지**한 draft/reserved/needs_reservation/not_required 건수다. cancelled 보기의 draft counts는 0이다. 품목 수량 합계를 KPI 건수로 쓰지 않는다.

상세는 목적 대상/담당자 → 입력 예약 → 열린 예정 효과 → 원래 snapshot/처리 이력이다. `targets`는 작업 목적을 설명하는 품목·수량이며 물리 출력과 동의어가 아니다. 공개 works에는 관리자 취소 사유/직원 PIN/감사 자격을 넣지 않는다. 취소 이유는 trim 후 1..1000자로 검증하고 보존한다.

일반 조회는 현행 사내 API 접근 경계를 그대로 쓴다. 명령의 requester ID 대조를 PIN 인증이라고 보고하지 않는다. 관리자 쓰기는 PIN + 기존 검증된 감사 세션의 직원 ID를 사용하고, 서명된 세션이 없으면 `actor_employee_id=null`, `actor_name=공유 관리자`다. 요청 body의 actor 이름이나 로그용 헤더를 신뢰해 실명을 확정하지 않는다. 조회 인증은 `require_admin_readonly`로 DB 초기화 없이 검증한다(`dependencies/admin.py:56`).

### 에러 형태

`{detail:{code,message,extra?}}`를 기존 `ApiError`가 보존한다. 오류 우선순위는 인증/소유권 → 버전 → 상태 → 유효 계획/업무 검증 → 잠근 재고 부족이다. 취소 중복 replay는 인증 후 동일 이벤트를 확인하는 명시적 예외다.

| HTTP / code | extra 및 클라이언트 대응 |
|---|---|
| 400 BAD_REQUEST / 403 FORBIDDEN | 기존 관리자 PIN 누락/불일치 규칙 유지. 잘못된 PIN을 성공 목록 0건으로 바꾸지 않음 |
| 404 NOT_FOUND | 존재하지 않는 조회 대상. 기존 owner delete idempotence 예외는 위 규칙 |
| 409 WORK_REVISION_CONFLICT | batch_id,current_revision,current_status. 작성/사유 유지, 최신 조회 |
| 409 WORK_STATE_CONFLICT | 이미 제출/취소 등. 최신 조회, 자동 재전송 금지 |
| 409 WORK_PLAN_CHANGED | batch_id,current_revision. 재저장/요청 수정으로 새 예약 필요 |
| 409 WORK_CREATE_KEY_CONFLICT | 같은 생성 key의 다른 내용. 기존 작업을 덮어쓰지 않음 |
| 409 WORK_RESERVATION_REQUIRED | needs_reservation 작업 제출 차단, 명시적 재저장 필요 |
| 422 STOCK_SHORTAGE | `shortages:string[]` 기존 안내 + `reservation_shortages:WorkReservationShortage[]` 구조화된 항목. 기존 입력/원장 보존 |
| 422 WORK_UNSUPPORTED_SOURCE | 과거 불량 출발 작업, 별도 불량 처리 경로 안내 |
| 422 VALIDATION_ERROR | 공백 사유, 음수/소수, 필수 버전 누락 등. Pydantic 기본 detail 배열도 공통 parser가 표시 |
| 409 IO_SETTLEMENT_FAILED_PERSISTED | batch_id,current_revision,current_status=failed,state_committed=true. 실패 이력 조회, 자동 재실행 금지 |
| 409 WORK_APPROVAL_FAILED_PERSISTED | request_id,batch_id,current_revision,current_status,state_committed=true. 해당 요청의 실패 기록과 나머지 열린 작업 조회 |

CP1 클라이언트는 쓰기를 재시도하지 않으며 error.extra를 제거하지 않는다. PIN은 기존 메모리 provider → `X-Admin-Pin`, 감사 세션은 공통 credentials/audit header 전달을 사용한다.

## 7. 캐시·전환·UI 경계

- 키: `inventory.workStatus(itemId)`, `admin.workReservations(params)`, `admin.workReservationDetail(batchId)`; admin 예약 root는 `['admin','workReservations']`다. PIN/사유를 key에 넣지 않는다.
- 기존 realtime inventory root에 일반 workStatus가 포함된다. admin 예약 root를 추가한다. CP5/CP6 mutation 성공 및 409 최신 조회에서도 해당 목록/상세·items·inventory·stockRequests를 무효화한다. 관리자 로그아웃에서는 예약 캐시를 제거하고 비인증 조회를 disabled로 둔다.
- 구조 마이그레이션은 기존 draft를 needs_reservation/legacy_unprocessed, 종료/제출 배치를 inactive로 표시하되 예약을 생성하지 않는다. 시작/GET도 자동 전환하지 않는다.
- backfill은 dry-run→apply, created_at/batch_id 순, 현재 입력 전량 확보 가능 건만 등록한다. dry-run은 앞선 가상 예약의 소비까지 시뮬레이션해 중복 약속을 피한다. apply는 매 작업 다시 잠금/재검증하고 작업별 실패만 롤백한다. 이미 같은 계획/상태/원장이면 재실행 no-op, 비활성/부족/미지원 사유는 보고한다.
- 이미 확보한 예약은 담당자가 비활성화돼도 유지한다. backfill의 비활성 판정은 아직 전환되지 않은 작업에만 적용하며 기존 예약 해제 근거가 아니다. 관리자 사유 취소로 정리한다.
- 현재 개발 DB 독립 복사본만 후속 런타임 검증에 사용한다. 원본 개발/직원 DB에는 CP1에서 연결·변경·전환하지 않는다.
- 부족품 가져오기는 원래 작업의 서버 저장 성공을 강제하지 않는다. CP5에서 batch ID/revision·수정 입력·단계·메모를 세션에 보존하고 창고 요청 복귀를 제공한다. 미등록 편집분은 예약이 아니고 창고 승인 대기도 도착 실재고가 아니다.
- 대시보드 분포바/위치배지/상세만 신규정보를 opt-in하고 실사는 기존 물리 의미 유지. 관리자 실제 화면·디자인 시안은 각각 CP6/CP2다. 이번 계약 파일에 시안을 대신하는 임시 UI를 넣지 않는다.

## 8. 검증 사례와 구현 위치

| ID / CP | 준비·행위 | 합격 기준 / 관련 구현 |
|---|---|---|
| B01 / CP3 | 셀 10, 승인2/출하1, draft3 저장 | pending+3, 가용4, 물리/TransactionLog 불변; io_draft/stock_availability |
| B02 / CP3 | 동일 draft3→5→2 수정 | 자기 원장 재사용, 증가분만 확보, 감소분 해제, 매번 version+1 |
| B03 / CP3 | 2개 자재 중 하나 부족한 수정 | 모든 내용/원장/version 원복, 위치별 shortage 반환 |
| B04 / CP3 | 같은 품목 입력5+미래 입고5, 현재0 | 저장 실패; 미래 입고 상계 없음 |
| B05 / CP3 | 동시 생성키/다른 내용/다른 소유자 | 한 배치/원장만, 409/403 구분, 정보 노출 없음 |
| B06 / CP3·CP7 | 마지막 1개 두 배치, 동일 배치 수정/삭제 경합 | 한 성공, 실패 전체 롤백. SQLite CAS와 PostgreSQL 잠금 각각 증거 |
| B07 / CP3 | BOM 제외·면제·커스텀 produce/disassemble | 저장계획=제출계획=forecast, 참조행/효과 반전 검증; io_dispatch |
| B08 / CP3 | 타 owner/제출 batch preview 가산 시도 | 403/409, 자기 draft만 credit, 공개 수량 불변 |
| B09 / CP3 | 승인 best-effort 해제/무결성 검사 | 타 draft 원장 보호, pending 기대합 포함; sr_reservation/integrity |
| B10 / CP4 | draft 제출→승인/즉시/자가승인 | 원장 이관 한 번, 실패 원복, 단일 revision 증가 |
| B11 / CP4 | 요청 수정→draft와 승인·취소 동시 | 잠금 순서 통일, 성공 시 재확보, 실패 시 기존 승인 보존 |
| B12 / CP4 | adjust 반려/일반 최종 반려/사용출고 | 해당 기존 복귀만 needs, 사용출고 수정 금지 유지 |
| B13 / CP4 | 한 batch 일부 완료/반려·나머지 열림 | 열린 line 효과만 한번 집계, 사용출고 수락 후 RESERVED 유지 |
| B14 / CP4 | 저장 후 경로/BOM정책 변경 | submit/approval WORK_PLAN_CHANGED, 기존 예약 보존 |
| B15 / CP4 | 사용출고 최종 정산 실패 | failed 확정·예약0·revision+1·state_committed, 재실행 없음 |
| B15a / CP4 | 일반 승인 실행 실패 및 실패 기록 중 다른 명령 경합 | 원래 실패 이력 유지·해당 요청 예약만 해제·batch+1, 중간 상태 변경 시 실패 기록으로 덮어쓰기 금지. 계약 오류는 이 경계에서 제외 |
| B16 / CP4 | 관리자 PIN 누락/잘못됨/공백사유/위조actor | 실제 권한 검사와 감사 세션만 사용, GET은 DB 불변 |
| B17 / CP4 | 관리자 취소 vs 제출, 동일 취소 재시도 | 한 상태전이, 같은 event replay만 no-op, 사유 보존 |
| B18 / CP4 | backfill 두 작업 자원경합/비활성/defective | 오래된 작업 우선 전량, 순서 시뮬레이션, 사유/재실행 안전 |
| B19 / CP4 | 물리0 출력품/부서 이동/불량 도착 | 위치별 예정 존재, global 이동0, 정상 가용 불변, 일괄 조회 |
| F01 / CP1 | 일반/관리자 list/detail/cancel HTTP | query 인코딩·false/0·signal·PIN header·revision/reason·409/422 보존 |
| F02 / CP1 | realtime revision 수신 | 품목 workStatus + 관리자 목록/상세 만료 |
| F03 / CP5 | 저장/submit 실패·재조회와 부족품 복귀 | 입력/원래 version 보존, 자동 재전송 없음 |
| F04 / CP5·CP6 | 예약/승인 라벨, 관리자 cache/취소 | 승인 전용 수치, PIN 없으면 신규조회 금지, 사유 유지 |

서버 B 사례의 주 파일은 상위 계획 CP3/CP4에 지정된 `test_io_draft_reservations.py`, `test_admin_work_reservations.py`, 기존 io/stock_request/concurrency 테스트다. 계약만으로 DB 경합·예약 로직 통과를 주장하지 않는다.
