# DEXCOWIN MES Inventory Cutover Runbook

목적: 기존 엑셀 운영을 중단하기 전에 DEXCOWIN MES의 재고 기준선을 새로 만들고, 이후 입고/출고/이동/불량/반품/취소는 프로그램 이력만 신뢰하도록 전환한다.

## 전환 원칙

- 품목, BOM, 직원, 부서, 제품 기호 같은 마스터 데이터는 유지한다.
- 과거 업무 이력은 운영 판단에서 제외한다.
- 전환 적용 시 `transaction_logs`, `transaction_edit_logs`, `stock_requests`, `stock_request_lines`, `io_batches`, `io_bundles`, `io_lines`를 비운다.
- 창고 지도 구조는 유지하고, 지도 안의 품목 수량(`warehouse_box_items`)만 비운다.
- 모든 재고 수량은 입력 파일의 `mes_code` 기준으로 덮어쓴다.
- 기본 모드는 dry-run이며 DB를 바꾸지 않는다.
- 실제 적용은 `--apply --confirm START-OVER`가 있어야만 실행된다.
- SQLite 적용 전에는 자동 백업을 먼저 만든다.

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

5. 실제 적용을 실행한다.

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

## 전환 후 판단

전환 후에는 과거 로그 기준의 경고가 남아 있으면 안 된다. 새로 시작한 뒤부터는 수량이 바뀌는 모든 업무 거래가 `transaction_logs.inventory_effect`와 처리자 ID를 남겨야 한다.
