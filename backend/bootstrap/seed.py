"""bootstrap.seed — 참조 데이터 시드 + mes_code 백필 + check.

- `seed_reference_data()` : Department / Employee / ProductSymbol /
   ProcessType 비어 있을 때만 시드 (멱등)
- `backfill_mes_codes()` : (생성열 전환 후) no-op — mes_code 는 DB 가 계산
- `check_db()`            : 쓰지 않고 상태만 리포트
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.engine import Connection

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
    AssemblyChecklist,
    AssemblyChecklistItem,
    AssemblyChecklistSection,
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


_ASSEMBLY_CHECKLIST_SEED: tuple[tuple[str, tuple[tuple[str | None, tuple[str, ...]], ...]], ...] = (
    (
        "DX3000",
        (
            (
                "전원 OFF",
                (
                    "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인",
                    "차폐 납 부착 상태 양호",
                    "하네스 연결 상태 양호\n- FFC 케이블 방향에 맞게 잘 연결하였는지 사출 체결 시 걸리지 않게 잘 부착하였는지 확인",
                    "조립 상태(내부) 양호\n- 제품 안쪽 굴러다니는 이물질 확인(CTR BD 이물질 확인)",
                    "조립 상태(외부) 양호\n- 제품 외관 확인",
                    "WINDOW 부착 상태 양호\n- 방향이 맞는지, 상처가 없는지, 이물질이 들어갔는지 확인",
                    "LCD BD의 리모컨 잭 부분이 FRONT COVER 홀 부분의 들어갔는지 확인",
                    "각 발생부, LCD, 사출의 시리얼라벨이 정상적으로 부착되어있고 \n제품공정카드에 정상적으로 기입되어있는지 확인",
                    "+-라벨이 정상적으로 부착되어있는지 확인",
                ),
            ),
            (
                "전원 ON",
                (
                    "펌웨어가 정상적으로 들어갔는지 확인",
                    "전원버튼의 녹색 LED가 점등되는지 확인",
                    "버튼의 눌림 상태와 각 버튼간의 상호적인 눌림이 없는지 확인",
                    "화면의 글자 깨짐이 있는지 확인",
                    "밝기의 차이 및 Backlight의 상태를 확인",
                    "전원 On/Off 및 Exposure시 부저음 확인",
                    "엑스선이 조사중일 때 황색 LED의 점등을 확인",
                    "Slide Switch를 사용하여 Right, Left의 EX Button 동작을 확인",
                ),
            ),
        ),
    ),
    (
        "ADX6000FB",
        (
            (
                None,
                (
                    "LCD 열고닫을때 소리안나는지 확인",
                    "차폐 납 부착 상태 양호 확인",
                    "하네스 연결 상태 양호 확인\n-하네스 연결 및 정리 상태 확인",
                    "조립 상태(내부) 양호 확인\n- 제품 안쪽 굴러다니는 이물질 확인",
                    "조립 상태(외부) 양호 확인\n- 제품 외관 확인",
                    "CTR BD 및 발생부 연결 상태 양호\n-사출에 빠지지 않고 잘 연결되어 있는지 확인",
                    "배터리 6핀 하네스 정배열맞는지 확인 (가끔 2핀3핀 엇갈려있는 하네스가 있음)",
                    "6홀 알루미늄 브라켓 안흔들리는지 확인",
                    "배터리 단자 위치 확인",
                    "컬리메이터 날개 위치 확인\n-컬리메이터가 안돌아가도록 방향에 맞게 고정되어야함",
                    "각 발생부, LCD, 사출 등의 시리얼라벨이 정상적으로 부착되어있고 \n제품공정카드에 정상적으로 기입되어있는지 확인",
                    "부직포 상태 양호 확인",
                    "POWER BUTTON이 정상적으로 눌리는지 확인",
                ),
            ),
        ),
    ),
    (
        "SOLO",
        (
            (
                None,
                (
                    "제품 외관 스크래치 확인",
                    "발생부 가이드 체결 확인",
                    "전원 ON 시 상단 LED 확인",
                    "Kapton Film Tape 부착 확인",
                    "LCD 화면 깨짐 확인",
                    "FFC , 하네스 빠져있는 부분 없는지 확인",
                    "스피커 음질 상태 확인",
                    "터치 및 반응속도 확인",
                    "WINDOW 들떠있는지 확인",
                    "LED 확산 아크릴 체결 확인",
                    "핸들 충전시 주황색 점등 확인",
                    "리모컨 연결시 트리거 작동 중복되는지 확인",
                    "튜브 번호가 제품과 일치하는지 확인",
                ),
            ),
        ),
    ),
    (
        "COCOON",
        (
            (
                None,
                (
                    "제품 외관 스크래치 확인",
                    "발생부 가이드 체결 확인",
                    "전원 ON 시 파워 버튼 청색 LED 확인",
                    "Kapton Film Tape 부착 확인",
                    "LCD 화면 깨짐 확인",
                    "FFC , 하네스 빠져있는 부분 없는지 확인",
                    "스피커 음질 상태 확인",
                    "터치 및 반응속도 확인",
                    "WINDOW 들떠있는지 확인",
                ),
            ),
        ),
    ),
)


def seed_reference_data() -> dict[str, int]:
    """참조 테이블이 비어 있을 때만 시드. idempotent."""
    counts = {
        "departments": 0,
        "employees": 0,
        "symbols": 0,
        "process_types": 0,
        "warehouse_angles": 0,
        "assembly_checklists": 0,
    }
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

        for model_name, sections in _ASSEMBLY_CHECKLIST_SEED:
            model = (
                db.query(ProductSymbol)
                .filter(ProductSymbol.model_name == model_name)
                .filter(ProductSymbol.is_reserved == False)  # noqa: E712
                .first()
            )
            if model is None or db.query(AssemblyChecklist).filter(AssemblyChecklist.model_slot == model.slot).first():
                continue
            checklist = AssemblyChecklist(model_slot=model.slot)
            db.add(checklist)
            db.flush()
            for section_order, (title, items) in enumerate(sections):
                section = AssemblyChecklistSection(
                    checklist_id=checklist.checklist_id,
                    title=title,
                    sort_order=section_order,
                )
                db.add(section)
                db.flush()
                db.add_all(
                    AssemblyChecklistItem(
                        section_id=section.section_id,
                        content=content,
                        sort_order=item_order,
                    )
                    for item_order, content in enumerate(items)
                )
            counts["assembly_checklists"] += 1
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


def check_db(connection: Connection | None = None) -> dict[str, int]:
    """실행하지 않고 현재 상태만 리포트."""
    if connection is not None:
        return {
            "employees": int(
                connection.scalar(select(func.count()).select_from(Employee.__table__)) or 0
            ),
            "process_types": int(
                connection.scalar(select(func.count()).select_from(ProcessType.__table__)) or 0
            ),
            "product_symbols": int(
                connection.scalar(select(func.count()).select_from(ProductSymbol.__table__)) or 0
            ),
            "items": int(
                connection.scalar(select(func.count()).select_from(Item.__table__)) or 0
            ),
            "items_missing_mes_code": int(
                connection.scalar(
                    select(func.count())
                    .select_from(Item.__table__)
                    .where(Item.__table__.c.mes_code.is_(None))
                )
                or 0
            ),
        }
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
