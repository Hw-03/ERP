"""참조 파일(_archive/reference/files/init_db_v4.js) 기준 직원 26명으로 동기화."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import Employee, DepartmentEnum, EmployeeLevelEnum

REFERENCE_EMPLOYEES = [
    ("E04", "김건호",  "조립/과장",    "조립"),
    ("E01", "김민재",  "조립/대리",    "조립"),
    ("E02", "김종숙",  "조립/주임",    "조립"),
    ("E06", "김현우",  "조립/사원",    "조립"),
    ("E05", "남재원",  "조립/사원",    "조립"),
    ("E03", "이계숙",  "조립/주임",    "조립"),
    ("E22", "이필욱",  "조립/부장",    "조립"),
    ("E07", "이형진",  "조립/사원",    "조립"),
    ("E09", "김재현",  "진공/사원",    "진공"),
    ("E10", "이지훈",  "진공/대리",    "진공"),
    ("E08", "허동현",  "진공/사원",    "진공"),
    ("E11", "김지현",  "고압/주임",    "고압"),
    ("E12", "민애경",  "고압/주임",    "고압"),
    ("E13", "오세현",  "튜닝/사원",    "튜닝"),
    ("E14", "이지현",  "튜닝/사원",    "튜닝"),
    ("E15", "김도영",  "튜브/주임",    "튜브"),
    ("E21", "문종현",  "AS/대리",      "AS"),
    ("E16", "이성민",  "연구소/책임",  "연구소"),
    ("E17", "오성식",  "연구소/주임",  "연구소"),
    ("E18", "류승범",  "기타/대표",    "기타"),
    ("E19", "최윤영",  "기타/과장",    "기타"),
    ("E20", "박성현",  "기타/부장",    "기타"),
    ("E23", "양승규",  "영업/부장",    "영업"),
    ("E24", "김예진",  "영업/대리",    "영업"),
    ("E25", "심이리나", "영업/과장",   "영업"),
    ("E26", "드미트리", "영업/사원",   "영업"),
]

CATEGORY_TO_DEPT = {
    "조립":  DepartmentEnum.ASSEMBLY,
    "진공":  DepartmentEnum.VACUUM,
    "고압":  DepartmentEnum.HIGH_VOLTAGE,
    "튜닝":  DepartmentEnum.TUNING,
    "튜브":  DepartmentEnum.TUBE,
    "AS":    DepartmentEnum.AS,
    "연구소": DepartmentEnum.RESEARCH,
    "기타":  DepartmentEnum.ETC,
    "영업":  DepartmentEnum.SALES,
}


def role_to_level(role: str) -> EmployeeLevelEnum:
    suffix = role.split("/")[-1] if "/" in role else role
    if suffix in ("대표",):
        return EmployeeLevelEnum.ADMIN
    if suffix in ("부장", "과장", "책임"):
        return EmployeeLevelEnum.MANAGER
    return EmployeeLevelEnum.STAFF


def main() -> None:
    db = SessionLocal()
    try:
        existing = db.query(Employee).count()
        print(f"기존 직원 {existing}명 삭제 후 26명으로 교체합니다.")
        db.query(Employee).delete()
        db.flush()

        for order, (code, name, role, category) in enumerate(REFERENCE_EMPLOYEES, start=1):
            db.add(Employee(
                employee_code=code,
                name=name,
                role=role,
                department=CATEGORY_TO_DEPT[category],
                level=role_to_level(role),
                display_order=order,
                is_active="true",
            ))

        db.commit()
        print(f"직원 {len(REFERENCE_EMPLOYEES)}명 삽입 완료.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
