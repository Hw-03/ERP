---
layer: backend
topic: schema
file: erp/backend/app/schemas.py
tags:
  - "#layer/backend"
  - "#topic/schema"
aliases:
  - Pydantic 스키마
  - UtcDatetime
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# 📝 schemas.py — Pydantic 요청/응답 스키마

> [!summary]
> FastAPI 요청/응답에 쓰는 Pydantic v2 스키마와 타입 계약을 정의한다. 핵심은 `UtcDatetime` alias(line 27–31) — naive datetime 에 자동으로 `+00:00` UTC offset 을 붙여 클라이언트에 ISO 8601 형식으로 직렬화한다.

---

## 1. 한 문장 목적

API 입력 검증과 응답 직렬화를 위한 Pydantic 스키마 컨테이너. DB 모델과 외부 API 계약 사이의 변환 계층.

---

## 2. 파일 위치 & 임포트 경로

```
erp/backend/app/schemas.py
from app.schemas import ItemCreate, ItemResponse, UtcDatetime, ...
```

---

## 3. UtcDatetime (commit 4db421a / F4b)

```python
# line 20-31
def _serialize_datetime_with_utc(dt: datetime) -> str:
    """Serialize naive datetime with +00:00 UTC offset."""
    if dt.tzinfo is None:
        return dt.isoformat() + "+00:00"
    return dt.isoformat()


UtcDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_datetime_with_utc, return_type=str),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]
```

> [!info] UtcDatetime 사용 이유
> SQLAlchemy 가 DB 에서 읽은 `datetime` 은 timezone-naive (tzinfo=None) 이다.
> 클라이언트가 이를 받으면 로컬 시간으로 해석할 수 있다. `UtcDatetime` 은
> naive datetime 에 자동으로 `+00:00` 을 붙여 항상 UTC 임을 명시한다.

---

## 4. 주요 스키마 목록

### 품목

| 스키마 | 용도 |
|--------|------|
| `ItemCreate` | POST /items 요청 |
| `ItemUpdate` | PATCH /items/{id} 요청 |
| `ItemResponse` | 품목 응답 (model_slots 포함) |

### 재고

| 스키마 | 용도 |
|--------|------|
| `InventoryResponse` | 재고 요약 응답 |
| `TransactionLogResponse` | 거래 이력 응답 |

### 직원

| 스키마 | 용도 |
|--------|------|
| `EmployeeCreate` | 직원 생성 |
| `EmployeeResponse` | 직원 응답 |

### 결재 요청

| 스키마 | 용도 |
|--------|------|
| `StockRequestCreate` | 결재 요청 생성 |
| `StockRequestResponse` | 결재 요청 응답 |

---

## 5. 모델 설정

```python
class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    # from_attributes=True → SQLAlchemy ORM 객체를 직접 직렬화 가능
```

---

## 6. ItemCreate 핵심 필드

```python
class ItemCreate(BaseModel):
    item_name: str = Field(..., max_length=200)
    spec: Optional[str]
    process_type_code: Optional[str] = Field(None, max_length=2)
    unit: str = Field("EA", max_length=20)
    initial_quantity: Optional[Decimal]
    model_slots: List[int] = Field(default=[])
    # model_slots: 사용 제품 슬롯 목록 (1=DX3000, 2=COCOON, ...)
    option_code: Optional[str] = Field(None, max_length=10)
```

---

## 7. 의존 관계

```
schemas.py
  ← models (EmployeeLevelEnum, LocationStatusEnum, RequestBucketEnum, ...)
  ← pydantic (BaseModel, ConfigDict, Field, PlainSerializer, AnnotatedTypes)
  호출자: 모든 라우터 (요청 파라미터 & 응답 모델)
```

---

## 8. 주의 사항

> [!warning]
> `UtcDatetime` 을 응답 스키마에 쓰지 않으면 naive datetime 이 그대로 직렬화되어 `"2026-05-21T14:30:00"` (offset 없음) 로 나간다. 프론트가 로컬 시간으로 해석해 1시간 오차가 생길 수 있다. 신규 응답 스키마에는 항상 `UtcDatetime` 을 사용한다.

---

## 9. 관련 노트 링크

- [[models.py]] — ORM 엔터티 (스키마가 참조하는 Enum 위치)
- [[main.py]] — FastAPI 앱 (라우터에서 스키마 사용)
