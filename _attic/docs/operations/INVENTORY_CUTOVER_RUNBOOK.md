# DEXCOWIN MES Inventory Cutover Runbook

목적: 기존 엑셀 운영을 중단하기 전에 DEXCOWIN MES의 재고 기준선을 새로 만들고, 이후 입고/출고/이동/불량/반품/취소는 프로그램 이력만 신뢰하도록 전환한다.

> **현재 실행 금지:** 이 문서는 도구의 안전 계약을 설명하기 위한 것이다. 실제 직원 환경 cutover는 품질 개선 **Checkpoint 5 완료와 별도 사용자 승인 이후**에만 허용한다. 그 전에는 dry-run과 `--apply`를 모두 실제 운영 DB에 실행하지 않는다.

## 전환 원칙

- 품목, BOM, 직원, 부서, 제품 기호 같은 마스터 데이터는 유지한다.
- 과거 업무 이력은 운영 판단에서 제외한다.
- 전환 적용 시 `transaction_logs`, `transaction_edit_logs`, `stock_requests`, `stock_request_lines`, `io_batches`, `io_bundles`, `io_lines`를 비운다.
- 창고 지도 구조는 유지하고, 지도 안의 품목 수량(`warehouse_box_items`)만 비운다.
- 모든 재고 수량은 입력 파일의 `mes_code` 기준으로 덮어쓴다.
- 기본 모드는 dry-run이며 DB를 바꾸지 않는다.
- 실제 적용은 `--apply --confirm START-OVER`가 있어야만 실행된다.
- SQLite 적용 전에는 자동 백업을 먼저 만든다.
- `--keep-history`와 API의 `clear_history=False`는 dry-run/apply 모두 입력 오류다. 출하·거래 이력을 남긴 채 기준 재고만 덮어쓰는 전환은 허용하지 않는다.
- apply는 기존 transaction이 없는 fresh session에서만 시작한다. SQLite는 `BEGIN IMMEDIATE`, PostgreSQL은 출하 요청·allocation·거래 로그 테이블의 exclusive lock으로 preflight와 mutation 사이에 새 출하 writer가 끼어들지 못하게 한다.
- 지원하지 않는 DB dialect와 이미 transaction이 열린 session은 fail-closed 한다.

## 출하 preflight 판정

cutover는 입력 재고를 읽기 전에 `shipping_requests`의 상태, allocation 상태별 수량 합계, 활성 `PICKUP`·`PREPARE`·`COMPONENT_CHANGE` 로그와 유효한 `inventory_effect`를 함께 보고한다. safe dry-run의 `CutoverSummary`와 CLI 표준 출력, unsafe 오류 객체와 CLI 오류 출력에 모두 `request_id`, 상태, 판정, allocation 합계, 활성 phase, PICKUP 로그 수, 유효 effect 수, malformed 수가 남는다. 판정은 다음 세 값뿐이다.

- `TERMINAL_SAFE`: `CANCELLED`이며 allocation이 없거나 `RELEASED`만 존재한다. 이 행만 cutover를 통과한다.
- `FUTURE_DELTA`: 정상 lifecycle이지만 향후 준비·픽업·취소로 재고가 변할 수 있다. `REQUESTED`, `PREPARING`, `PREPARED`와 유효한 픽업 근거를 가진 정상 `PICKED_UP`이 포함된다.
- `INCONSISTENT`: 알 수 없는 상태/배정값, 정상 상태와 맞지 않는 allocation 조합, `RESERVED`·`CONSUMED` 혼합, 유효한 활성 `PICKUP inventory_effect`가 없는 `PICKED_UP`, 요청 없는 orphan allocation/log, 또는 해석할 수 없는 활성 로그다.

`FUTURE_DELTA` 또는 `INCONSISTENT`가 한 건이라도 있으면 dry-run과 apply가 모두 실패하고 DB 테이블은 바뀌지 않는다. allocation이 없는 레거시 `PREPARED`는 fallback 픽업으로 차감할 수 있고, allocation이 없는 `PICKED_UP`도 pickup 취소로 원복할 수 있으므로 둘 다 `FUTURE_DELTA`다. `PICKUP inventory_effect`는 허용된 키만 가진 목록이어야 하고 delta는 bool·float·문자열이 아닌 32-bit 범위의 0이 아닌 JSON 정수여야 한다. `None`, 빈 배열, zero-only, 잘못된 scope/status/key/delta는 근거로 인정하지 않는다.

`TERMINAL_SAFE` 행은 apply 뒤에도 자동 삭제하거나 다른 요청에 승계하지 않는다. 기존 요청과 `RELEASED` allocation은 그대로 남고, `CANCELLED` 상태 계약이 준비·픽업·각 취소 명령의 향후 재고 변경을 막는다.

apply 중 오류가 나면 이력 삭제와 새 기준 재고 반영을 같은 transaction에서 명시적으로 rollback한다. 운영자는 오류 후 재실행하기 전에 preflight 보고서와 독립 무결성 검사를 다시 확인해야 한다.

## 입력 파일 형식

CSV 또는 XLSX를 사용할 수 있다. 첫 행은 반드시 헤더여야 한다.

```csv
mes_code,bucket,department,quantity,location
3-TR-0001,warehouse,,100,WH-A
3-AA-0001,production,Assembly,7,Line-1
3-AA-0001,defective,Assembly,2,Line-1
```

컬럼 의미:

- `mes_code`: DEXCOWIN MES 품목 코드. 품목명 매칭은 하지 않는다.
- `bucket`: `warehouse`, `production`, `defective` 중 하나.
- `department`: `production`, `defective`일 때 필수. `warehouse`일 때는 비워야 한다.
- `quantity`: 0 이상의 정수.
- `location`: 선택 입력. 품목의 참고 위치로 저장된다.

기본적으로 입력 파일에 없는 활성 품목이 있으면 실패한다. 실제 파일이 “수량 있는 품목만” 담는 방식이면 적용 시 `--missing-items-zero`를 붙여 누락 품목을 0으로 처리한다.

## 실행 절차

1. 업무 사용을 멈춘다.
2. 입력 파일을 준비한다.
3. dry-run을 실행한다.

```bat
python scripts\ops\inventory_cutover.py C:\path\real_inventory.csv
```

4. 출력 요약을 확인한다.

- `items updated`가 예상 품목 수와 맞는지 확인한다.
- `transaction logs deleted`, `stock requests deleted`, `io batches deleted`, `warehouse box items deleted`가 예상 삭제 범위인지 확인한다.
- 누락/중복/알 수 없는 `mes_code`가 나오면 파일을 고친 뒤 dry-run을 다시 실행한다.
- `shipping preflight`의 모든 행이 `TERMINAL_SAFE`인지, allocation 상태별 수량 합과 로그/effect 수가 실제 업무 기록과 맞는지 확인한다. 안전하지 않은 행은 자동 삭제·승계하지 않는다.

5. Checkpoint 5 완료 및 별도 사용자 승인을 확인한 뒤에만 실제 적용을 실행한다.

```bat
python scripts\ops\inventory_cutover.py C:\path\real_inventory.csv --apply --confirm START-OVER
```

수량 있는 품목만 들어있는 파일이라면:

```bat
python scripts\ops\inventory_cutover.py C:\path\real_inventory.csv --apply --confirm START-OVER --missing-items-zero
```

6. 무결성 검사를 실행한다.

```bat
python scripts\ops\check_inventory_integrity.py
```

7. 운영 준비 검사를 실행한다.

```bat
scripts\ops\operational_readiness.bat
```

8. 마지막 줄이 `PASS operational readiness`인지 확인한 뒤 프로그램 운영을 시작한다.

## 실패 시 기준

- `unknown mes_code`: 입력 파일 코드가 품목 마스터에 없다. 품목을 먼저 등록하거나 파일을 수정한다.
- `duplicate stock bucket`: 같은 품목, 같은 bucket, 같은 부서가 두 번 들어갔다. 합산해서 한 줄로 만든다.
- `missing mes_code rows`: 활성 품목이 입력 파일에 없다. 파일에 0수량으로 추가하거나, 누락을 0으로 볼 때만 `--missing-items-zero`를 사용한다.
- `unknown department`: 부서명이 DEXCOWIN MES의 활성 부서와 맞지 않는다.
- `quantity must be an integer`: 소수 수량은 허용하지 않는다.
- `shipping cutover preflight rejected`: 보고된 요청의 `FUTURE_DELTA` 또는 `INCONSISTENT`를 운영 상태에서 먼저 해소해야 한다. 행이나 DB를 임의 삭제하지 않는다.
- `clear_history=False is unsafe` / `--keep-history is unsafe`: 과거 이력을 보존한 cutover는 지원하지 않는다.
- `fresh Session` / `does not support database dialect`: writer exclusion을 보장할 수 없어 적용을 시작하지 않았다.

## 전환 후 판단

전환 후에는 과거 로그 기준의 경고가 남아 있으면 안 된다. 새로 시작한 뒤부터는 수량이 바뀌는 모든 업무 거래가 `transaction_logs.inventory_effect`와 처리자 ID를 남겨야 한다.
