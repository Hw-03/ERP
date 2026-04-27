---
type: code-note
project: ERP
layer: scripts
source_path: scripts/dev/import_real_inventory.py
status: active
updated: 2026-04-27
source_sha: f64087c5f2a9
tags:
  - erp
  - scripts
  - dev-script
  - py
---

# import_real_inventory.py

> [!summary] 역할
> 개발 중 데이터 생성, 점검, 로컬 진단을 돕는 보조 스크립트다.

## 원본 위치

- Source: `scripts/dev/import_real_inventory.py`
- Layer: `scripts`
- Kind: `dev-script`
- Size: `12568` bytes

## 연결

- Parent hub: [[scripts/dev/dev|scripts/dev]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

> 전체 326줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""
data/재고_입력_양식.xlsx 를 읽어서 items / inventory 테이블에 반영.

기본 동작:
    py scripts/dev/import_real_inventory.py
        → dry-run. 몇 건 추가/업데이트/스킵될지 리포트만 출력.

실제 반영:
    py scripts/dev/import_real_inventory.py --apply
        → 기존 품목은 품번(item_code) 기준 upsert, 없으면 새 품목 등록.

기존 971개 테스트 데이터 삭제 후 완전 교체:
    py scripts/dev/import_real_inventory.py --apply --wipe-existing
        (주의: 되돌릴 수 없음. 사용자 확인 필수)
"""

from __future__ import annotations

import os
import sys
from argparse import ArgumentParser
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_XLSX = ROOT / "data" / "재고_입력_양식.xlsx"
BACKEND_DIR = ROOT / "backend"
SQLITE_PATH = BACKEND_DIR / "erp.db"

sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{SQLITE_PATH.as_posix()}")

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import CategoryEnum, Inventory, Item  # noqa: E402


# 양식과 1:1 매칭되는 헤더 (순서 무관, 헤더명으로 찾음)
REQUIRED_HEADERS = ["품목명", "카테고리", "현재수량"]
OPTIONAL_HEADERS = ["규격", "단위", "부서", "모델", "품번", "자재분류", "공급사", "안전재고", "바코드"]
ALL_HEADERS = REQUIRED_HEADERS + OPTIONAL_HEADERS

DATA_START_ROW = 6  # 1=헤더, 2~4=예시, 5=힌트, 6~=실입력

VALID_CATEGORIES = {c.value for c in CategoryEnum}

# seed.py 와 일치시킬 legacy 매핑
CATEGORY_TO_FILE_TYPE = {
    "RM": "원자재", "TA": "조립자재", "TF": "조립자재",
    "HA": "발생부자재", "HF": "발생부자재",
    "VA": "발생부자재", "VF": "발생부자재",
    "AA": "조립자재", "AF": "조립자재",
    "FG": "완제품",
}
CATEGORY_TO_PART = {
    "RM": "자재창고", "TA": "튜닝파트", "TF": "튜닝파트",
    "HA": "고압파트", "HF": "고압파트",
    "VA": "진공파트", "VF": "진공파트",
    "AA": "조립출하", "AF": "조립출하",
    "FG": "출하",
}


def parse_decimal(value) -> Decimal | None:
    if value is None:
        return None
    text = str(value).strip()
    if text in {"", "None", "N/A", "-"}:
        return None
    try:
        return Decimal(text.replace(",", ""))
    except InvalidOperation:
        return None


def read_rows(xlsx_path: Path) -> tuple[list[dict], list[str]]:
    """양식 xlsx 를 읽어서 dict 리스트와 에러 메시지 리스트 반환."""
    wb = load_workbook(xlsx_path, data_only=True)
    if "재고입력" not in wb.sheetnames:
        raise RuntimeError(f"'재고입력' 시트가 없습니다: {xlsx_path}")
    ws = wb["재고입력"]

    header_row = [ws.cell(row=1, column=c).value for c in range(1, 30)]
    header_to_col: dict[str, int] = {}
    for idx, h in enumerate(header_row, start=1):
        if h and str(h).strip() in ALL_HEADERS:
            header_to_col[str(h).strip()] = idx

    missing = [h for h in REQUIRED_HEADERS if h not in header_to_col]
    if missing:
        raise RuntimeError(f"필수 헤더 누락: {missing}")

    rows: list[dict] = []
    errors: list[str] = []

    for excel_row in range(DATA_START_ROW, ws.max_row + 1):
        raw = {h: ws.cell(row=excel_row, column=col).value for h, col in header_to_col.items()}
        # 완전히 빈 행은 스킵 (에러 아님)
        if all(v is None or (isinstance(v, str) and not v.strip()) for v in raw.values()):
            continue

        item_name = (str(raw.get("품목명") or "")).strip()
        if not item_name:
            errors.append(f"행 {excel_row}: 품목명 비어 있음 → 스킵")
            continue

        category = (str(raw.get("카테고리") or "")).strip().upper()
        if category not in VALID_CATEGORIES:
            errors.append(f"행 {excel_row}: 카테고리 '{category}' 유효하지 않음 → 스킵 "
                          f"(가능값: {sorted(VALID_CATEGORIES)})")
            continue

        qty = parse_decimal(raw.get("현재수량"))
        if qty is None:
            qty = Decimal("0")

        rows.append({
            "excel_row": excel_row,
            "품목명": item_name,
            "카테고리": category,
            "현재수량": qty,
            "규격": (str(raw.get("규격") or "")).strip() or None,
            "단위": (str(raw.get("단위") or "")).strip() or "EA",
            "부서": (str(raw.get("부서") or "")).strip() or None,
            "모델": (str(raw.get("모델") or "")).strip() or "공용",
            "품번": (str(raw.get("품번") or "")).strip() or None,
            "자재분류": (str(raw.get("자재분류") or "")).strip() or None,
            "공급사": (str(raw.get("공급사") or "")).strip() or None,
            "안전재고": parse_decimal(raw.get("안전재고")),
            "바코드": (str(raw.get("바코드") or "")).strip() or None,
        })

    return rows, errors


def assign_item_codes(db, rows: list[dict]) -> None:
    """품번 비어있는 행에 카테고리별 자동 품번 부여 (RM-00001 형식). in-place."""
    existing = {}
    for item in db.query(Item).all():
        code = item.item_code or ""
        if "-" in code:
            prefix, _, tail = code.partition("-")
            try:
                existing[prefix] = max(existing.get(prefix, 0), int(tail))
            except ValueError:
                pass

    # 이번 배치에서 새로 부여할 일련번호 카운터 (기존 최대 + 1부터)
    next_serial = {cat: existing.get(cat, 0) for cat in VALID_CATEGORIES}

    for row in rows:
        if row["품번"]:
            continue
        cat = row["카테고리"]
        next_serial[cat] = next_serial.get(cat, 0) + 1
        row["품번"] = f"{cat}-{next_serial[cat]:05d}"


def apply_rows(db, rows: list[dict], wipe: bool) -> dict:
    now = datetime.utcnow()

    if wipe:
        deleted_inv = db.query(Inventory).delete()
        deleted_item = db.query(Item).delete()
        db.commit()
        print(f"  [WIPE] 기존 Inventory {deleted_inv}건, Item {deleted_item}건 삭제")

    stats = Counter()

    for row in rows:
        existing = db.query(Item).filter(Item.item_code == row["품번"]).first()
        category_enum = CategoryEnum(row["카테고리"])

        if existing:
            existing.item_name = row["품목명"]
            existing.spec = row["규격"]
            existing.category = category_enum
            existing.unit = row["단위"]
            existing.barcode = row["바코드"] or row["품번"]
            existing.legacy_file_type = CATEGORY_TO_FILE_TYPE.get(row["카테고리"], "미분류")
            existing.legacy_part = CATEGORY_TO_PART.get(row["카테고리"], "자재창고")
            existing.legacy_item_type = row["자재분류"]
            existing.legacy_model = row["모델"]
            existing.supplier = row["공급사"]
            existing.min_stock = row["안전재고"]
            existing.updated_at = now

            inv = db.query(Inventory).filter(Inventory.item_id == existing.item_id).first()
            if inv:
                inv.quantity = row["현재수량"]
                inv.warehouse_qty = row["현재수량"]
                inv.location = row["부서"]
                inv.updated_at = now
            else:
                db.add(Inventory(
                    item_id=existing.item_id,
                    quantity=row["현재수량"],
                    warehouse_qty=row["현재수량"],
                    location=row["부서"],
                    updated_at=now,
                ))
            stats["updated"] += 1
        else:
            item = Item(
                item_code=row["품번"],
                item_name=row["품목명"],
                spec=row["규격"],
                category=category_enum,
                unit=row["단위"],
                barcode=row["바코드"] or row["품번"],
                legacy_file_type=CATEGORY_TO_FILE_TYPE.get(row["카테고리"], "미분류"),
                legacy_part=CATEGORY_TO_PART.get(row["카테고리"], "자재창고"),
                legacy_item_type=row["자재분류"],
                legacy_model=row["모델"],
                supplier=row["공급사"],
                min_stock=row["안전재고"],
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
