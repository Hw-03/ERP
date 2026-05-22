---
type: file-explanation
source_path: "backend/app/models.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# models.py — DB 구조의 기준 파일

## 이 파일은 무엇을 책임지나

품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 파일입니다.

## 업무 흐름에서의 의미

회사 재고 시스템에서 ‘무엇을 저장할 수 있는가’를 결정합니다. 테이블 구조가 바뀌면 운영 데이터와 화면이 모두 영향을 받습니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BoolAsString`
- `TransactionTypeEnum`
- `LocationStatusEnum`
- `DepartmentEnum`
- `DeptAdjSubTypeEnum`
- `EmployeeLevelEnum`
- `Department`
- `Item`
- `Inventory`
- `InventoryLocation`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

운영 DB 구조와 직결됩니다. 변경 전 백업, 마이그레이션, 스키마/API 테스트가 필요합니다.

## 핵심 발췌

```python
"""MES data models for the DEXCOWIN manufacturing workflow."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator

from app.database import Base


class BoolAsString(TypeDecorator):
    """DB 에는 'true'/'false' 문자열로, 애플리케이션에서는 bool 로 다룬다.

    기존 Employee.is_active 가 VARCHAR(5) 로 저장되는 관성을 유지하면서 ORM 레이어에서만
    bool 로 정규화. 스키마 변경 필요 없음.
    """

    impl = String(5)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            return "true" if value else "false"
        # 기존 문자열/정수 입력 호환
        if isinstance(value, str):
            return "true" if value.lower() in ("true", "1", "yes", "t") else "false"
        return "true" if bool(value) else "false"

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            return value
```
