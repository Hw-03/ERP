---
type: file-explanation
source_path: "backend/app/schemas/employee.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# employee.py — 직원·PIN API 형식

## 이 파일은 뭐예요?

직원 등록/수정/조회와 PIN 관련 요청의 데이터 모양을 정의합니다. 직원 관리 화면과 PIN 입력/변경이 이 형식을 씁니다.

## 언제 보나요?

- 직원 등록·수정 화면이 보내는 항목(소속·직급·결재 역할·입출고 권한·담당 모델)을 확인할 때
- PIN 검증/초기화/변경 요청 형식을 볼 때

## 중요한 내용 (주요 클래스)

- `EmployeeCreate`/`EmployeeUpdate`/`EmployeeResponse` — 직원 정보. `warehouse_role`/`department_role`(none/primary/deputy) 로 결재 역할을, `io_enabled` 로 입출고 권한을, `assigned_model_slots`(순서=우선순위) 로 조립 부서 담당 모델을 지정.
- `PinVerifyRequest` — 작업자 식별용 PIN(실제 보안 인증 아님).
- `EmployeePinResetRequest`(관리자 PIN 필요) / `EmployeePinChangeRequest`(현재 PIN 검증).
- `EmployeeThemeUpdate` — 개인 테마.

## 연결되는 파일

- [[ERP/backend/app/models/employee.py]] — 이 형식이 비추는 실제 직원·부서 표.
- [[ERP/backend/app/routers/employees.py]] — 이 형식을 입출력으로 쓰는 직원 API.
- [[ERP/backend/app/services/pin_auth.py]] — PIN 검증 업무 규칙.

## 핵심 발췌

```python
class EmployeeCreate(BaseModel):
    name: str = Field(..., max_length=100)
    department: str
    warehouse_role: str = Field("none", ...)   # none/primary/deputy
    io_enabled: Optional[bool] = True
    assigned_model_slots: Optional[List[int]] = None  # 순서 = priority
```
