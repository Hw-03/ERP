---
type: file-explanation
source_path: "backend/app/services/dept_adjustment.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# dept_adjustment.py — dept_adjustment.py 설명

## 이 파일은 무엇을 책임지나

`dept_adjustment.py`는 `dept_adjustment` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdjLine`
- `_dept_for_item`
- `_has_bom_children`
- `_enrich`
- `build_production_template`
- `build_disassembly_template`
- `expand_component`
- `submit_adjustment`
- `submit_defective_disassemble`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/routers/dept_adjustment.py]] — `dept_adjustment.py`는 `dept_adjustment` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
"""부서 재고 조정 서비스 — 생산/조립·분해/회수·수량 보정.

처리 정책:
- 부서 PRODUCTION 재고끼리만 움직임 (즉시 처리, 창고 승인 불필요).
- 원자성: db.flush()만 사용, commit은 라우터에서. ValueError 발생 시 라우터가 rollback.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal, Optional

from sqlalchemy.orm import Session

from app.models import (
    BOM,
    DepartmentEnum,
    DeptAdjSubTypeEnum,
    Inventory,
    Item,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.database import _is_sqlite
from app.services import inventory as inventory_svc

AdjDirection = Literal["in", "out", "defective"]


@dataclass
class AdjLine:
    item_id: uuid.UUID
    direction: AdjDirection
    quantity: Decimal
    department: DepartmentEnum
    reason: Optional[str] = None
    bom_expected: Optional[Decimal] = None
    has_children: bool = False
    item_name: str = ""
    item_code: Optional[str] = None
    process_type_code: Optional[str] = None
    unit: str = "EA"


def _dept_for_item(item: Item) -> DepartmentEnum:
    """품목의 process_type_code로 기본 부서 결정. None이면 조립 폴백."""
    dept = inventory_svc.dept_for_process_type(item.process_type_code)
    return dept if dept is not None else DepartmentEnum.ASSEMBLY


def _has_bom_children(db: Session, item_id: uuid.UUID) -> bool:
    return db.query(BOM).filter(BOM.parent_item_id == item_id).limit(1).first() is not None
```
