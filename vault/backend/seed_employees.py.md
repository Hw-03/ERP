---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/seed_employees.py
status: active
updated: 2026-04-27
source_sha: 012f68838802
tags:
  - erp
  - backend
  - source-file
  - py
---

# seed_employees.py

> [!summary] 역할
> 원본 프로젝트의 `seed_employees.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/seed_employees.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `3256` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````python
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
# ... (이하 52줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
