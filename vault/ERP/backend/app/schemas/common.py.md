---
type: file-explanation
source_path: "backend/app/schemas/common.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# common.py — 공용 schema 요소

## 이 파일은 뭐예요?

여러 도메인이 함께 쓰는 공용 형식 조각을 모은 파일입니다. 날짜를 항상 UTC 로 내보내는 규칙(`UtcDatetime`), 관리자 PIN 요청/응답, 재고 정합성 점검 응답, 어느 도메인에도 딱 안 맞는 자잘한 클래스가 여기 있습니다.

## 언제 보나요?

- API 응답의 날짜가 왜 항상 `+00:00` 로 끝나는지 확인할 때
- 관리자 PIN 검증/변경, 재고 정합성 점검 응답 형식을 볼 때

## 중요한 내용 (주요 클래스)

- `UtcDatetime` — 날짜 타입. naive datetime 도 직렬화할 때 `+00:00` 을 붙여 항상 UTC 로 내보냅니다. 다른 schema 모듈이 전부 이걸 가져다 씁니다.
- `AdminPinVerifyRequest`/`AdminPinUpdateRequest` — 관리자 PIN 검증·변경.
- `IntegrityCheckResponse`/`IntegrityRepairResponse` — 재고 정합성 점검·복구 결과.
- `ReservationLineResponse` — 품목별 점유 중 라인(상세 패널 표시용).
- `MessageResponse`/`ErrorResponse` — 공용 메시지·오류.

## 연결되는 파일

- [[ERP/backend/app/schemas/📁_schemas]] — 같은 패키지. 거의 모든 형제 모듈이 여기서 `UtcDatetime` 을 가져갑니다.
- [[ERP/backend/app/models/base.py]] — 공용 Enum 의 원본 정의.

## 핵심 발췌

```python
UtcDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_datetime_with_utc, return_type=str),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]
```
