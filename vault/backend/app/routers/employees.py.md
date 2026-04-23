---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/employees.py
status: active
tags:
  - erp
  - backend
  - router
  - employees
aliases:
  - 직원 라우터
  - 직원 API
---

# employees.py

> [!summary] 역할
> 직원 마스터 데이터를 관리하는 API. 재고 입출고 시 담당자 선택에 사용된다.

> [!info] 주요 책임
> - `GET /api/employees` — 직원 목록 조회 (부서·활성여부 필터)
> - `POST /api/employees` — 직원 추가
> - `PUT /api/employees/{employee_id}` — 직원 정보 수정
> - `DELETE /api/employees/{employee_id}` — 직원 삭제(비활성화)

> [!warning] 주의
> - 초기 직원 데이터는 `main.py`의 `ensure_reference_data()`에서 시드됨
> - 부서 목록: 조립, 고압, 진공, 튜닝, 튜브, AS, 연구, 영업, 출하, 기타

---

## 쉬운 말로 설명

이 라우터는 **"직원 마스터 CRUD"**. 화면 곳곳의 "담당자 선택" 드롭다운에서 참조하는 원본 데이터.

직원 등급(`level`)은 `admin`/`manager`/`staff` 3단계. `admin`만 관리 탭에서 설정 건드릴 수 있는 UI 분기에 사용.

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/employees` | GET | 목록 (department, active_only 필터) |
| `/api/employees` | POST | 생성 (employee_code 유니크) |
| `/api/employees/{employee_id}` | PUT | 수정 (부분 업데이트) |
| `/api/employees/{employee_id}` | DELETE | **하드 삭제** (행 자체 제거) |

### 요청 예시
```json
POST /api/employees
{
  "employee_code": "EMP-042",
  "name": "김현우",
  "role": "생산팀장",
  "phone": "010-1234-5678",
  "department": "조립",
  "level": "manager",
  "display_order": 10,
  "is_active": true
}
```

### 정렬
`GET` 기본 정렬: `display_order ASC, name ASC`. 화면 표시 순서 제어.

### 비활성 처리
`is_active=false`로 PUT하면 활성 필터에서 제외. 완전 삭제 대신 권장.

---

## FAQ

**Q. DELETE는 왜 비활성 대신 하드 삭제?**
간단 구현. 운영에서는 `PUT is_active=false`로 대체 권장. 삭제된 직원이 남긴 pending·배치는 `ON DELETE SET NULL`로 `owner_employee_id=NULL`.

**Q. 같은 이름 직원 여러 명?**
OK. 유니크는 `employee_code`만. 이름 중복은 허용.

**Q. `display_order` 용도?**
화면 드롭다운에서 자주 쓰는 사람을 위로 올리는 용도. 숫자 작을수록 위.

**Q. `level=admin`은 몇 명?**
초기 시드에는 1명. 필요 시 PUT으로 변경. admin PIN과는 별개(단순 UI 가시성용).

**Q. 부서 변경 시 영향?**
과거 이력은 유지(비정규화 `owner_name` 사용). 앞으로 배치 생성 시엔 새 부서가 반영.

---

## 관련 문서

- [[backend/app/main.py.md]] — 초기 시드
- [[backend/app/models.py.md]] — `Employee`, `DepartmentEnum`, `EmployeeLevelEnum`
- [[frontend/app/admin/admin]]

Up: [[backend/app/routers/routers]]
