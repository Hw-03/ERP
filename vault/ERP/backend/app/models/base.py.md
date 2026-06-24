---
type: file-explanation
source_path: "backend/app/models/base.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# base.py — 모델 공통 베이스·공통 타입·공통 Enum

## 이 파일은 무엇을 책임지나

모든 표가 공유하는 기반을 모아 둔 파일입니다. SQLAlchemy 의 공통 베이스(Base), 특수 저장 타입 3종, 부서·보정 종류 Enum 을 정의합니다.

## 업무 흐름에서의 의미

직접 화면에 보이진 않지만, "수량은 정수만", "참/거짓을 문자열로 저장", "UUID 를 일관된 형식으로 저장" 같은 회사 공통 약속이 여기서 강제됩니다. 다른 모든 모델 파일이 이 약속을 가져다 씁니다.

## 언제 보면 좋나

- 수량 칸이 왜 소수를 못 받는지(IntQuantity) 확인할 때
- is_active 가 왜 'true'/'false' 문자열인지(BoolAsString) 볼 때
- 부서 종류(DepartmentEnum)의 정확한 목록이 필요할 때

## 중요한 내용

- `Base` — `app.database` 의 declarative_base 를 그대로 재export. 모듈을 쪼개도 metadata 정체성이 유지됩니다.
- `BoolAsString` — 참/거짓을 DB 엔 'true'/'false' 문자열로 저장하고 코드에선 bool 로 다루는 타입. 기존 스키마를 안 바꾸려는 장치.
- `IntQuantity` — 수량 전용 정수 타입. 바인딩 시 Decimal/float/str 을 int 로 강제. 전 품목 EA 단위라 수량에 소수가 없습니다.
- `UUIDString` — UUID 를 하이픈 없는 32자 hex 로 일관 저장·조회하는 타입.
- `DepartmentEnum` — 부서 목록(조립/고압/진공/튜닝/튜브/AS/연구/영업/출하/기타/창고).
- `DeptAdjSubTypeEnum` — 부서 보정 종류(생산/분해/수량보정).

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 이 공통 타입을 쓰는 모든 모델.
- [[ERP/backend/app/database.py]] — Base 의 원래 출처.

## 핵심 발췌

```python
class IntQuantity(TypeDecorator):
    impl = Integer
    def process_bind_param(self, value, dialect):
        return None if value is None else int(value)
```
