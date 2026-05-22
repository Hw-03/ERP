---
type: file-explanation
source_path: "_attic/scripts/dev/apply_bom_memo_items.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# apply_bom_memo_items.py — apply_bom_memo_items.py 설명

## 이 파일은 무엇을 책임지나

`apply_bom_memo_items.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `discover_item_fks`
- `purge_item`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""담당자 13항목 메모 → backend/erp.db 일괄 반영.

A) 이름/문구 수정 4건
B) 통합/삭제 2건 (#2 6-AR-0355 삭제 / #9 6-AR-0185 repoint 후 삭제)
C) 신규 19항목 INSERT

- DB는 정본. BOM 부모-자식 연결은 사람이 나중에 워크벤치로(이번 범위 아님).
- 재고·입출고 등 의존행은 테스트 데이터 → 삭제 시 전부 폐기.
- 단일 트랜잭션. 멱등 가드(신규 코드 선존재 시 중단).
- foreign_keys OFF(기본) 상태에서 의존행을 동적으로 전부 수동 정리 후 items 삭제.
"""
import datetime
import shutil
import sqlite3
import sys
import uuid

sys.stdout.reconfigure(encoding="utf-8")

DB = r"backend/erp.db"

# --- A. 이름/문구 수정 (erp_code → 새 이름) ---
RENAMES = {
    "8-VA-0011": "발생부 고압B/D+튜브 최종 작업完 [DXDR-070]",
    "6-AA-0046": "ADX6000FB BODY RIGHT ASS'Y",
    "46-AR-0100": "ADX4000W, ADX6000 16핀 FFC Cable (사파리 공용)",
    "6-AR-0113": "ADX6000 BOTTOM BLOCK",  # #2 생존품, Blcok→BLOCK
}

# --- B. 삭제 대상 (재고·이력 폐기) ---
DELETE_CODES = ["6-AR-0355", "6-AR-0185"]
# #9: 6-AR-0185 를 자식으로 쓰는 BOM 을 46-AR-0100 으로 repoint 후 6-AR-0185 삭제
REPOINT_FROM = "6-AR-0185"
REPOINT_TO = "46-AR-0100"

# --- C. 신규 19항목 (품목명, erp_code, process_type_code, model_symbol) ---
NEW_ITEMS = [
    ("ADX6000 BAT CONNECT BD (Ver 4.0)", "6-AR-0356", "AR", "6"),
    ("COCOON TOP BODY (W)", "7-AR-0357", "AR", "7"),
    ("COCOON CRADLE BODY (W)", "7-AR-0358", "AR", "7"),
    ("COCOON CRADLE BOTTOM (W)", "7-AR-0359", "AR", "7"),
    ('5" LCD TOP COVER', "4-AR-0360", "AR", "4"),
    ('5" LCD BOTTOM COVER', "4-AR-0361", "AR", "4"),
    ('5" LCD BD', "4-AR-0362", "AR", "4"),
    ('5" LCD 판넬', "4-AR-0363", "AR", "4"),
    ('5" LCD BD ASS\'Y', "4-AA-0077", "AA", "4"),
    ("ADX6000 DFI_BD ASS'Y", "6-AA-0078", "AA", "6"),
    ('ADX4000W 60KV 2mA / 15cm White [일본] (5" 적용)', "4-AF-0043", "AF", "4"),
    ("SOLO 70KV, 2mA / 20cm Black [iM3 / 트리거 에이밍 적용]", "8-AF-0044", "AF", "8"),
    ("Podiatry Stand Pole", "6-PR-0182", "PR", "6"),
    ("Podiatry Stand Arm", "6-PR-0183", "PR", "6"),
    ("Podiatry Stand 브라켓", "6-PR-0184", "PR", "6"),
    ("AllMyT For DX3000 ASS'Y", "3-PA-0027", "PA", "3"),
    ("AllMyT For ADX6000 ASS'Y", "6-PA-0028", "PA", "6"),
    ("Chest & Bed For ADX6000 ASS'Y", "6-PA-0029", "PA", "6"),
```
