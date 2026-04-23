---
type: code-note
project: ERP
layer: backend
source_path: backend/seed_employees.py
status: active
tags:
  - erp
  - backend
  - seed
  - employees
aliases:
  - 직원 시드 스크립트
---

# seed_employees.py

> [!summary] 역할
> 실제 직원 26명 데이터를 DB에 동기화하는 스크립트.
> `_archive/reference` 기준 파일을 바탕으로 현재 DB와 일치시킨다.

> [!info] 포함 직원 목록 (부서별)
> | 부서 | 인원 | 예시 |
> |------|------|------|
> | 조립 | 8명 | 김건호(과장), 김민재(대리), 이형진(사원) |
> | 진공 | 3명 | 허동현, 김재현, 이지훈 |
> | 고압 | 2명 | 김지현, 민애경 |
> | 튜닝 | 2명 | 오세현, 이지현 |
> | 튜브 | 1명 | 김도영 |
> | AS | 1명 | 문종현 |
> | 연구소 | 2명 | 이성민, 오성식 |
> | 기타 | 3명 | 류승범(대표), 최윤영, 박성현 |
> | 영업 | 4명 | 양승규, 김예진, 심이리나, 드미트리 |

> [!warning] 주의
> 이 스크립트는 기존 직원을 **업데이트**하거나 **신규 추가**만 하며, 삭제는 하지 않는다.

## 실행 방법

```bash
cd backend
python seed_employees.py
```

---

## 쉬운 말로 설명

**실제 회사 직원 26명 데이터를 DB 에 심는 스크립트**. `backend/app/main.py` 의 `startup` 이 한 번 자동 실행하지만, 엑셀 명단이 바뀌면 이 스크립트를 수동 재실행해서 동기화.

## upsert 동작

- 기존 직원 (이름/부서/상태 바뀜) → UPDATE
- 신규 직원 → INSERT
- **DB 에만 있고 스크립트에 없는 직원** → 유지 (삭제 안 함)

"삭제 없음" 원칙은 과거 이력(who did what) 보존 목적.

## FAQ

**Q. 퇴사자 처리?**
`status=inactive` 로 바꾸면 UI 목록에서 빠지지만 이력은 남음. 완전 삭제는 DB 직접 조작 + 이력 FK 제약 주의.

**Q. 직원 아바타 색상 규칙?**
`employeeColor()` (legacyUi.ts) 가 부서명 기반 해시로 고정 색상 반환. 이 스크립트와 별개.

---

## 관련 문서

- [[backend/app/routers/employees.py.md]] — 직원 관리 API
- [[backend/seed.py.md]] — 기본 시드 스크립트
- [[frontend/app/legacy/_components/legacyUi.ts.md]] — `employeeColor`

Up: [[backend/backend]]
