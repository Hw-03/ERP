---
type: file-explanation
source_path: "backend/app/schemas/department.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# department.py — 부서·제품 모델 API 형식

## 이 파일은 뭐예요?

부서와 제품 모델(슬롯) 관리 화면이 서버와 주고받는 데이터 모양을 정의합니다. 부서 추가/수정/정렬, 제품 모델 추가/수정/정렬이 이 형식을 씁니다.

## 언제 보나요?

- 부서 관리 화면(색상·표시순서·입출고 허용)이 보내는 항목을 확인할 때
- 제품 모델 슬롯의 기호·이름 수정 요청 형식을 볼 때

## 중요한 내용 (주요 클래스)

- `DepartmentCreate`/`DepartmentUpdate`/`DepartmentResponse` — 부서. `color_hex`(지도 색), `io_enabled`(입출고 허용), 수정·삭제는 관리자 `pin` 필요.
- `DepartmentReorderPayload`/`DepartmentDeleteRequest` — 정렬·삭제(PIN 동반).
- `ProductModelResponse`/`ProductModelCreate`/`ProductModelUpdate` — 제품 모델 슬롯의 기호(`symbol`)·이름(`model_name`). `protected_namespaces=()` 로 `model_` 접두 필드 경고를 끕니다.
- `ProductModelReorderPayload`/`ProductModelDeleteRequest` — 정렬·삭제(PIN 동반).

## 연결되는 파일

- [[ERP/backend/app/models/employee.py]] — 부서 표(직원과 같은 모듈).
- [[ERP/backend/app/models/code.py]] — 제품기호 마스터.
- [[ERP/backend/app/routers/departments.py]] · [[ERP/backend/app/routers/models.py]] — 이 형식을 쓰는 API.

## 핵심 발췌

```python
class DepartmentCreate(BaseModel):
    name: str = Field(..., max_length=50)
    pin: str = Field(..., description="관리자 PIN")
    color_hex: Optional[str] = Field(None, max_length=7)
    io_enabled: Optional[bool] = True
```
