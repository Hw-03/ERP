---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/employees.py
tags: [vault, code-note, backend, router]
aliases: [직원 마스터 API]
---

# 📦 employees.py — 직원 마스터 CRUD + PIN 관리

> [!summary] 역할
> 직원 정보 관리의 모든 엔드포인트.  
> CRUD(목록/생성/수정/삭제) 외에 PIN 검증·변경·초기화, 담당 모델 배정, 테마 설정까지 담당한다.  
> 삭제는 이력이 있으면 소프트 삭제(비활성화), 없으면 영구 삭제로 분기된다.

#layer/backend #topic/router #topic/employees

---

## 1. 역할

- 직원 목록 조회 / 생성 / 수정 / 삭제
- PIN 검증 (`verify-pin`), 본인 PIN 변경 (`change-pin`), 관리자 PIN 으로 초기화 (`reset-pin`)
- 담당 모델 슬롯 배정 (`assigned_model_slots`): `EmployeeAssignedModel` 테이블 통째 교체
- 테마 설정 저장 (light/dark/null)
- 모든 생성/수정/삭제에 `audit.record` 감사 기록

## 2. 원본 위치

```
erp/backend/app/routers/employees.py
```

## 3. import

| 모듈 | 용도 |
|------|------|
| `app.models.Employee, EmployeeAssignedModel, ProductSymbol, StockRequest` | ORM |
| `app.services.pin_auth` | hash_pin, verify_pin, DEFAULT_PIN_HASH |
| `app.services.rate_limit` | PIN 브루트포스 완화 |
| `app.services.audit` | 감사 기록 |
| `app.routers.settings.require_admin` | 관리자 PIN 검증 (reset-pin 용) |
| `app.services._tx.commit_and_refresh, commit_only` | 원자적 DB 커밋 |

## 4. export (endpoint 목록)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/employees` | 직원 목록 (department/active_only 필터) |
| POST | `/employees` | 직원 생성 (employee_code 자동 부여 가능) |
| PUT | `/employees/{employee_id}` | 직원 정보 수정 |
| DELETE | `/employees/{employee_id}` | 삭제 or 비활성화 |
| POST | `/employees/{employee_id}/verify-pin` | PIN 검증 (rate-limit 있음) |
| POST | `/employees/{employee_id}/change-pin` | 본인 PIN 변경 |
| POST | `/employees/{employee_id}/reset-pin` | PIN 초기화 (관리자 PIN 필요) |
| PUT | `/employees/{employee_id}/theme` | 테마 설정 |

## 5. 참조처

- 프론트엔드 직원 관리 화면
- `transactions.py::_verify_editor` → Employee PIN 검증 시 동일 로직
- `departments.py::require_admin` — settings.py 의 `require_admin` 을 공유 사용

## 6. 업무 흐름

```mermaid
flowchart TD
    subgraph CRUD
        A[GET /employees] --> B[_assigned_slots_bulk N+1 없음]
        C[POST /employees] --> D[_auto_employee_code\n빈 경우 E숫자 자동]
        D --> E[_sync_assigned_models]
        E --> F[audit.record employee.create]
    end

    subgraph PIN
        G[POST /verify-pin] --> H[rate_limit 체크]
        H --> I[verify_pin]
        I -->|실패| J[rate_limit.record_failure]
        I -->|성공| K[rate_limit.record_success]

        L[POST /reset-pin] --> M[require_admin 관리자PIN]
        M --> N[pin_hash = DEFAULT_PIN_HASH]
    end

    subgraph 삭제 분기
        O[DELETE /{employee_id}] --> P{StockRequest 이력?}
        P -->|있음| Q[is_active=False\n audit deactivate]
        P -->|없음| R[db.delete\n audit delete]
    end
```

## 7. 핵심 함수

### `_sync_assigned_models` — 담당 모델 통째 교체

```python
def _sync_assigned_models(db: Session, employee_id: uuid.UUID, slots: List[int]) -> None:
    """직원의 담당 모델을 payload 순서(=priority)로 통째 교체.
    존재하지 않는 slot, 중복 slot 은 무시한다 (조용히 dedupe).
    빈 리스트면 매핑 전부 제거.
    """
    db.query(EmployeeAssignedModel).filter(
        EmployeeAssignedModel.employee_id == employee_id
    ).delete(synchronize_session=False)
    # 유효한 slot 만 INSERT (ProductSymbol 존재 확인)
    valid_slots = {row.slot for row in db.query(ProductSymbol.slot)
                   .filter(ProductSymbol.slot.in_(unique_ordered)).all()}
    for idx, slot in enumerate(unique_ordered):
        if slot not in valid_slots:
            continue
        db.add(EmployeeAssignedModel(employee_id=employee_id, slot=slot, priority=idx))
```

### `_auto_employee_code` — E{숫자} 자동 부여

```python
def _auto_employee_code(db: Session) -> str:
    import re
    codes = [e.employee_code for e in db.query(Employee.employee_code).all()]
    nums = [int(m.group(1)) for c in codes if c and (m := re.fullmatch(r"E(\d+)", c))]
    return f"E{max(nums, default=0) + 1}"
```

### `verify_employee_pin` — rate-limit 포함

```python
@router.post("/{employee_id}/verify-pin", response_model=EmployeeResponse)
def verify_employee_pin(employee_id, payload, request, db):
    client_ip = getattr(getattr(request, "client", None), "host", None) or "unknown"
    rl_key = f"verify_pin:{employee_id}:{client_ip}"

    if rate_limit.is_blocked(rl_key):
        raise http_error(429, ErrorCode.TOO_MANY_REQUESTS, "PIN 시도가 너무 많습니다.")

    ...
    if not verify_pin(employee.pin_hash, payload.pin):
        rate_limit.record_failure(rl_key)
        raise http_error(403, ...)

    rate_limit.record_success(rl_key)
    return _to_response(employee, ...)
```

## 8. 위험 포인트

> [!danger] 삭제 분기: 비활성화 vs 영구 삭제
> `StockRequest` 이력이 있으면 비활성화, 없으면 영구 삭제.  
> 이력 테이블이 추가되면 이 조건을 확장해야 한다.  
> 현재는 `StockRequest` 만 체크한다.

> [!warning] is_active 의 타입 혼용
> DB 에서 `is_active` 는 문자열 `"true"/"false"` 로 저장되지만 (레거시),  
> `_to_response` 에서 `bool(employee.is_active)` 로 변환한다.  
> 코드 내 조건문에서 `if employee.is_active` (truthy) 와 `== "true"` 가 혼용됨.

> [!warning] PIN 검증은 실제 인증이 아님
> docstring 에 명시: "작업자 식별용 PIN 검증 — 실제 보안 인증이 아님."

## 9. 죽은 코드 의심

- `_assigned_slots_for` 는 `create_employee`, `update_employee`, `reset-pin` 응답 조립에 사용.  
  `_assigned_slots_bulk` 와 역할이 겹치지만 단건이라 유지.

## 10. 수정 전 체크

- [ ] `warehouse_role` / `department_role` 허용 값: `none/primary/deputy` — 스키마 레벨 Enum 없음, 라우터에서 직접 검증
- [ ] `_sync_assigned_models` 는 delete + insert 방식 — flush 시점 주의 (commit 전 id 필요)
- [ ] `change-pin`: 현재 PIN 과 새 PIN 이 같으면 422 — 프론트에서도 동일 검증 권장

## 11. 코드 발췌

```python
@router.delete("/{employee_id}")
def delete_employee(employee_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    has_requests = db.query(StockRequest).filter(
        StockRequest.requester_employee_id == employee_id
    ).first() is not None

    if has_requests:
        employee.is_active = False
        employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
        audit.record(db, request=request, action="employee.deactivate", ...)
        commit_only(db)
        return JSONResponse(status_code=200, content={"result": "deactivated"})
    else:
        audit.record(db, request=request, action="employee.delete", ...)
        db.delete(employee)
        commit_only(db)
        return JSONResponse(status_code=200, content={"result": "deleted"})
```

---

## 관련 노트

- [[_routers]] — 라우터 허브
- [[erp/backend/app/routers/settings.py]] — require_admin (reset-pin 사용)
- [[erp/backend/app/services/pin_auth.py]] — hash_pin / verify_pin
- [[erp/backend/app/services/rate_limit.py]] — PIN rate-limit

Up: [[_routers]]
