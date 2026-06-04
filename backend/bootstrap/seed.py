"""bootstrap.seed — 참조 데이터 시드 + mes_code 백필 + check.

- `seed_reference_data()` : Department / Employee / ProductSymbol /
   ProcessType 비어 있을 때만 시드 (멱등)
- `backfill_mes_codes()` : (생성열 전환 후) no-op — mes_code 는 DB 가 계산
- `check_db()`            : 쓰지 않고 상태만 리포트
"""
from __future__ import annotations

from app.database import SessionLocal
from app.models import (
    Department,
    DepartmentEnum,
    Employee,
    EmployeeAssignedModel,  # noqa: F401 — metadata registration
    EmployeeLevelEnum,
    Item,
    ProcessType,
    ProductSymbol,
    WarehouseAngle,
)
from app.services.pin_auth import DEFAULT_PIN_HASH

# ---------------------------------------------------------------------------
# 시드 데이터 정의
# ---------------------------------------------------------------------------
_EMPLOYEE_SEED: list[tuple] = [
    ("E04", "김건호", "조립/과장", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.MANAGER),
    ("E01", "김민재", "조립/대리", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E02", "김종숙", "조립/주임", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E06", "김현우", "조립/사원", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E05", "남재원", "조립/사원", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E03", "이계숙", "조립/주임", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E22", "이필욱", "조립/부장", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.MANAGER),
    ("E07", "이형진", "조립/사원", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E09", "김재현", "진공/사원", DepartmentEnum.VACUUM, EmployeeLevelEnum.STAFF),
    ("E10", "이지훈", "진공/대리", DepartmentEnum.VACUUM, EmployeeLevelEnum.STAFF),
    ("E08", "허동현", "진공/사원", DepartmentEnum.VACUUM, EmployeeLevelEnum.STAFF),
    ("E11", "김지현", "고압/주임", DepartmentEnum.HIGH_VOLTAGE, EmployeeLevelEnum.STAFF),
    ("E12", "민애경", "고압/주임", DepartmentEnum.HIGH_VOLTAGE, EmployeeLevelEnum.STAFF),
    ("E13", "오세현", "튜닝/사원", DepartmentEnum.TUNING, EmployeeLevelEnum.STAFF),
    ("E14", "이지현", "튜닝/사원", DepartmentEnum.TUNING, EmployeeLevelEnum.STAFF),
    ("E15", "김도영", "튜브/주임", DepartmentEnum.TUBE, EmployeeLevelEnum.STAFF),
    ("E21", "문종현", "AS/대리", DepartmentEnum.AS, EmployeeLevelEnum.STAFF),
    ("E16", "이성민", "연구소/책임", DepartmentEnum.RESEARCH, EmployeeLevelEnum.MANAGER),
    ("E17", "오성식", "연구소/주임", DepartmentEnum.RESEARCH, EmployeeLevelEnum.STAFF),
    ("E18", "류승범", "기타/대표", DepartmentEnum.ETC, EmployeeLevelEnum.ADMIN),
    ("E19", "최윤영", "기타/과장", DepartmentEnum.ETC, EmployeeLevelEnum.MANAGER),
    ("E20", "박성현", "기타/부장", DepartmentEnum.ETC, EmployeeLevelEnum.MANAGER),
    ("E23", "양승규", "영업/부장", DepartmentEnum.SALES, EmployeeLevelEnum.MANAGER),
    ("E24", "김예진", "영업/대리", DepartmentEnum.SALES, EmployeeLevelEnum.STAFF),
    ("E25", "심이리나", "영업/과장", DepartmentEnum.SALES, EmployeeLevelEnum.MANAGER),
    ("E26", "드미트리", "영업/사원", DepartmentEnum.SALES, EmployeeLevelEnum.STAFF),
]

_PRODUCT_SYMBOL_ASSIGNED: list[tuple] = [
    (1, "3", "DX3000"),
    (2, "7", "COCOON"),
    (3, "8", "SOLO"),
    (4, "4", "ADX4000W"),
    (5, "6", "ADX6000FB"),
    (6, "9", "신제품"),  # 9 prefix 품목 15건의 모델
]

_PROCESS_TYPES: list[tuple] = [
    ("TR", "T", "R", 10, "튜브 원자재"),
    ("TA", "T", "A", 20, "튜브 중간공정"),
    ("TF", "T", "F", 25, "튜브 공정완료"),
    ("HR", "H", "R", 15, "고압 원자재"),
    ("HA", "H", "A", 30, "고압 중간공정"),
    ("HF", "H", "F", 35, "고압 공정완료"),
    ("VR", "V", "R", 25, "진공 원자재"),
    ("VA", "V", "A", 40, "진공 중간공정"),
    ("VF", "V", "F", 45, "진공 공정완료"),
    ("NR", "N", "R", 50, "튜닝 원자재"),
    ("NA", "N", "A", 55, "튜닝 중간공정"),
    ("NF", "N", "F", 60, "튜닝 공정완료"),
    ("AR", "A", "R", 45, "조립 원자재"),
    ("AA", "A", "A", 65, "조립 중간공정"),
    ("AF", "A", "F", 70, "조립 공정완료"),
    ("PR", "P", "R", 55, "출하 원자재"),
    ("PA", "P", "A", 75, "출하 중간공정"),
    ("PF", "P", "F", 80, "출하 공정완료"),
]

# 창고 지도 기본 앵글 9개 — 프로토타입 ANGLES + POSITIONS 1:1.
# (id, label, rows, layers, pos_x, pos_y, width, height). 880×300 좌표계.
_WAREHOUSE_ANGLE_SEED: list[tuple] = [
    (1, "앵글 1", 6, 6, 718, 100, 74, 172),
    (2, "앵글 2", 6, 6, 600, 100, 74, 172),
    (3, "앵글 3", 6, 6, 526, 100, 74, 172),
    (4, "앵글 4", 6, 6, 408, 100, 74, 172),
    (5, "앵글 5", 6, 6, 334, 100, 74, 172),
    (6, "앵글 6", 6, 6, 146, 15, 646, 60),
    (7, "앵글 7", 3, 6, 218, 100, 72, 87),
    (8, "앵글 8", 3, 6, 146, 100, 72, 87),
    (9, "앵글 9", 4, 6, 12, 15, 57, 116),
]


def seed_reference_data() -> dict[str, int]:
    """참조 테이블이 비어 있을 때만 시드. idempotent."""
    counts = {"departments": 0, "employees": 0, "symbols": 0, "process_types": 0, "warehouse_angles": 0}
    db = SessionLocal()
    try:
        if db.query(Department).count() == 0:
            _DEPT_SEED = ["조립", "고압", "진공", "튜닝", "튜브", "AS", "연구", "영업", "출하", "기타"]
            for i, name in enumerate(_DEPT_SEED):
                db.add(Department(name=name, display_order=i, is_active=True))
                counts["departments"] += 1
            db.commit()

        if db.query(Employee).count() == 0:
            for idx, (code, name, role, dept, level) in enumerate(_EMPLOYEE_SEED, start=1):
                db.add(
                    Employee(
                        employee_code=code,
                        name=name,
                        role=role,
                        department=dept,
                        level=level,
                        display_order=idx,
                        is_active="true",
                        pin_hash=DEFAULT_PIN_HASH,  # 기본 PIN: 0000
                    )
                )
                counts["employees"] += 1
            db.commit()

        if db.query(ProductSymbol).count() == 0:
            for slot, symbol, model in _PRODUCT_SYMBOL_ASSIGNED:
                db.add(
                    ProductSymbol(
                        slot=slot,
                        symbol=symbol,
                        model_name=model,
                        is_finished_good=True,
                        is_reserved=False,
                    )
                )
                counts["symbols"] += 1
            for slot in range(7, 101):
                db.add(ProductSymbol(slot=slot, symbol=None, model_name=None, is_reserved=True))
                counts["symbols"] += 1
            db.commit()

        if db.query(ProcessType).count() == 0:
            for code, prefix, suffix, order, desc in _PROCESS_TYPES:
                db.add(
                    ProcessType(
                        code=code,
                        prefix=prefix,
                        suffix=suffix,
                        stage_order=order,
                        description=desc,
                    )
                )
                counts["process_types"] += 1
            db.commit()

        if db.query(WarehouseAngle).count() == 0:
            for aid, label, rows, layers, x, y, w, h in _WAREHOUSE_ANGLE_SEED:
                db.add(
                    WarehouseAngle(
                        id=aid,
                        label=label,
                        rows=rows,
                        layers=layers,
                        jaris_per_cell=3,
                        pos_x=x,
                        pos_y=y,
                        width=w,
                        height=h,
                        display_order=aid,
                        is_active=True,
                    )
                )
                counts["warehouse_angles"] += 1
            db.commit()
    finally:
        db.close()
    return counts


# ---------------------------------------------------------------------------
# 품목 코드 백필
# ---------------------------------------------------------------------------
def backfill_mes_codes() -> int:
    """mes_code 는 이제 분해필드에서 DB 가 계산하는 STORED 생성열 — 별도 백필 불필요.

    분해필드(model_symbol/process_type_code/serial_no)가 NOT NULL 이라 미완 품목이 없고,
    mes_code 직접 쓰기는 SQLite 가 거부한다. 호출 호환(bootstrap_all·bootstrap_db.py)을
    위해 시그니처만 유지하고 0 을 반환한다.
    """
    return 0


def check_db() -> dict:
    """실행하지 않고 현재 상태만 리포트."""
    db = SessionLocal()
    try:
        report = {
            "employees": db.query(Employee).count(),
            "process_types": db.query(ProcessType).count(),
            "product_symbols": db.query(ProductSymbol).count(),
            "items": db.query(Item).count(),
            "items_missing_mes_code": db.query(Item).filter(Item.mes_code.is_(None)).count(),
        }
    finally:
        db.close()
    return report
