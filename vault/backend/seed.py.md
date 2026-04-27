---
type: code-note
project: ERP
layer: backend
source_path: backend/seed.py
status: active
updated: 2026-04-27
source_sha: 86bab88d0eed
tags:
  - erp
  - backend
  - source-file
  - py
---

# seed.py

> [!summary] 역할
> 원본 프로젝트의 `seed.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/seed.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `15895` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

> 전체 444줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""
Seed SQLite ERP data from ERP_Master_DB.csv.

Usage:
    python backend/seed.py
    cd backend && python seed.py
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from argparse import ArgumentParser
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
CSV_PATH = PROJECT_ROOT / "data" / "ERP_Master_DB.csv"
SQLITE_PATH = BACKEND_DIR / "erp.db"
LEGACY_HTML_PATH = PROJECT_ROOT / "_legacy_import" / "inventory_v2.html"

sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{SQLITE_PATH.as_posix()}"

from app.database import Base, SessionLocal, engine
from app.models import (
    BOM,
    CategoryEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    Item,
    ShipPackage,
    ShipPackageItem,
    TransactionLog,
)


CATEGORY_MAP = {
    "RM": CategoryEnum.RM,
    "TA": CategoryEnum.TA,
    "TF": CategoryEnum.TF,
    "HA": CategoryEnum.HA,
    "HF": CategoryEnum.HF,
    "VA": CategoryEnum.VA,
    "VF": CategoryEnum.VF,
    "AA": CategoryEnum.AA,
    "AF": CategoryEnum.AF,
    "FG": CategoryEnum.FG,
    "UK": CategoryEnum.UK,
}

CATEGORY_TO_FILE_TYPE: dict[str, str] = {
    "RM": "원자재",
    "TA": "조립자재",
    "TF": "조립자재",
    "HA": "발생부자재",
    "HF": "발생부자재",
    "VA": "발생부자재",
    "VF": "발생부자재",
    "AA": "조립자재",
    "AF": "조립자재",
    "FG": "완제품",
}

CATEGORY_TO_PART: dict[str, str] = {
    "RM": "자재창고",
    "TA": "튜닝파트",
    "TF": "튜닝파트",
    "HA": "고압파트",
    "HF": "고압파트",
    "VA": "진공파트",
    "VF": "진공파트",
    "AA": "조립출하",
    "AF": "조립출하",
    "FG": "출하",
}

DEFAULT_STOCK_QTY = Decimal("100")

LEGACY_DEPARTMENT_MAP = {
    "조립": DepartmentEnum.ASSEMBLY,
    "고압": DepartmentEnum.HIGH_VOLTAGE,
    "진공": DepartmentEnum.VACUUM,
    "튜닝": DepartmentEnum.TUNING,
    "튜브": DepartmentEnum.TUBE,
    "AS": DepartmentEnum.AS,
    "연구소": DepartmentEnum.RESEARCH,
    "영업": DepartmentEnum.SALES,
    "출하": DepartmentEnum.SHIPPING,
    "기타": DepartmentEnum.ETC,
}


def parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None

    text = str(value).strip()
    if text in {"", "None", "N/A", "-"}:
        return None

    try:
        return Decimal(text.replace(",", ""))
    except InvalidOperation:
        return None


def get_category(code: str | None) -> CategoryEnum:
    if not code:
        return CategoryEnum.UK
    return CATEGORY_MAP.get(str(code).strip().upper(), CategoryEnum.UK)


def infer_legacy_category(file_type: str | None, part: str | None) -> CategoryEnum:
    file_type = (file_type or "").strip()
    part = (part or "").strip()

    if file_type == "원자재":
        return CategoryEnum.RM
    if file_type == "완제품" or part == "출하":
        return CategoryEnum.FG
    if file_type == "조립자재":
        return CategoryEnum.AA
    if file_type == "발생부자재":
        if "고압" in part:
            return CategoryEnum.HA
        if "진공" in part:
            return CategoryEnum.VA
        if "튜닝" in part or "튜브" in part:
            return CategoryEnum.TA
    return CategoryEnum.UK


def infer_employee_level(role: str) -> EmployeeLevelEnum:
    if "대표" in role:
        return EmployeeLevelEnum.ADMIN
    if any(keyword in role for keyword in ("부장", "과장", "책임")):
        return EmployeeLevelEnum.MANAGER
    return EmployeeLevelEnum.STAFF


def extract_legacy_init_db() -> dict:
    if not LEGACY_HTML_PATH.exists():
        raise FileNotFoundError(f"Legacy HTML file not found: {LEGACY_HTML_PATH}")

    text = LEGACY_HTML_PATH.read_text(encoding="utf-8")
    match = re.search(r"var INIT_DB=(\{.*?\});</script>", text, re.S)
    if not match:
        raise ValueError("Could not locate INIT_DB in legacy HTML.")
    return json.loads(match.group(1))


def reset_core_tables(db) -> None:
    db.query(ShipPackageItem).delete()
    db.query(ShipPackage).delete()
    db.query(BOM).delete()
    db.query(TransactionLog).delete()
    db.query(Inventory).delete()
    db.query(Item).delete()
    db.query(Employee).delete()
    db.commit()


DEFAULT_EMPLOYEES = [
    {"code": "E22", "name": "이필욱",   "role": "조립/부장",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E04", "name": "김건호",   "role": "조립/과장",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E01", "name": "김민재",   "role": "조립/대리",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E02", "name": "김종숙",   "role": "조립/주임",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E03", "name": "이계숙",   "role": "조립/주임",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E05", "name": "남재원",   "role": "조립/사원",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E06", "name": "김현우",   "role": "조립/사원",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E07", "name": "이형진",   "role": "조립/사원",   "department": DepartmentEnum.ASSEMBLY},
    {"code": "E10", "name": "이지훈",   "role": "진공/대리",   "department": DepartmentEnum.VACUUM},
    {"code": "E08", "name": "허동현",   "role": "진공/사원",   "department": DepartmentEnum.VACUUM},
    {"code": "E09", "name": "김재현",   "role": "진공/사원",   "department": DepartmentEnum.VACUUM},
    {"code": "E11", "name": "김지현",   "role": "고압/주임",   "department": DepartmentEnum.HIGH_VOLTAGE},
    {"code": "E12", "name": "민애경",   "role": "고압/주임",   "department": DepartmentEnum.HIGH_VOLTAGE},
    {"code": "E13", "name": "오세현",   "role": "튜닝/사원",   "department": DepartmentEnum.TUNING},
    {"code": "E14", "name": "이지현",   "role": "튜닝/사원",   "department": DepartmentEnum.TUNING},
    {"code": "E15", "name": "김도영",   "role": "튜브/주임",   "department": DepartmentEnum.TUBE},
    {"code": "E21", "name": "문종현",   "role": "AS/대리",     "department": DepartmentEnum.AS},
    {"code": "E16", "name": "이성민",   "role": "연구소/책임", "department": DepartmentEnum.RESEARCH},
    {"code": "E17", "name": "오성식",   "role": "연구소/주임", "department": DepartmentEnum.RESEARCH},
    {"code": "E23", "name": "양승규",   "role": "영업/부장",   "department": DepartmentEnum.SALES},
    {"code": "E24", "name": "김예진",   "role": "영업/대리",   "department": DepartmentEnum.SALES},
    {"code": "E25", "name": "심이리나", "role": "영업/과장",   "department": DepartmentEnum.SALES},
    {"code": "E26", "name": "드미트리", "role": "영업/사원",   "department": DepartmentEnum.SALES},
    {"code": "E18", "name": "류승범",   "role": "기타/대표",   "department": DepartmentEnum.ETC},
    {"code": "E19", "name": "최윤영",   "role": "기타/과장",   "department": DepartmentEnum.ETC},
    {"code": "E20", "name": "박성현",   "role": "기타/부장",   "department": DepartmentEnum.ETC},
]


def seed_employees(db, now) -> None:
    """직원 테이블이 비어있을 때 기본 직원 목록을 삽입한다."""
    if db.query(Employee).count() > 0:
        return
    for order, emp in enumerate(DEFAULT_EMPLOYEES):
        db.add(Employee(
            employee_code=emp["code"],
            name=emp["name"],
            role=emp["role"],
            phone=None,
            department=emp["department"],
            level=infer_employee_level(emp["role"]),
            display_order=order,
            is_active="true",
            created_at=now,
            updated_at=now,
        ))
    db.commit()
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
