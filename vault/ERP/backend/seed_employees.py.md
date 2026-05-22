---
type: file-explanation
source_path: "backend/seed_employees.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# seed_employees.py — seed_employees.py 설명

## 이 파일은 무엇을 책임지나

`seed_employees.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/seed_employees.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `role_to_level`
- `main`

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
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
```
