---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/seed_employees.py
tags: [vault, code-note, b-tier]
---

# seed_employees.py — 직원 26명 참조 데이터 동기화

> [!summary] 역할
> _archive/reference/files/init_db_v4.js 기준 정규 직원 26명을 Employee 테이블에 동기화. 부서별 직급 포함.

## 1. 이 파일의 역할
- REFERENCE_EMPLOYEES: (직원코드, 이름, 직급표기, 부서명) 튜플 26개
- CATEGORY_TO_DEPT: 직급 문자열(조립/대리) → DepartmentEnum/EmployeeLevelEnum 매핑
- 직급: 부장/과장/대리/주임/사원/책임 6종
- 부서: 조립/진공/고압/튜닝/튜브/AS/연구소/기타/영업

## 2. 실제 원본 위치
`backend/seed_employees.py` — 약 80줄

## 3. 주요 import
```python
from app.database import SessionLocal
from app.models import Employee, DepartmentEnum, EmployeeLevelEnum
```

## 4. 어디서 쓰이는지
- bootstrap_db.py 의 seed 옵션 호출 대상
- Employee 테이블 초기 적재
- 타 시스템(Excel/legacy)과 직원 목록 싱크 기준

## 5. ⚠️ 위험 포인트
- **하드코딩된 26명** — 신입/퇴사 시 수동 수정 필수 (자동화 없음)
- E01~E26 employee_code는 sequential — 새 직원 추가 시 E27부터 이어가야 함
- 직급 표기(조립/대리) → DepartmentEnum/EmployeeLevelEnum 이중 매핑 (직급과 부서가 혼재)
- 삭제 로직 없음 — 퇴사자는 is_active 필드로 수동 처리

## 6. 수정 전 체크
- 직원 이름/코드 중복 확인
- 모든 employee_code가 E로 시작하는지 확인
- CATEGORY_TO_DEPT의 모든 키가 REFERENCE_EMPLOYEES의 직급과 일치하는지 확인
