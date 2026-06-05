---
type: file-explanation
source_path: "backend/app/routers/inventory/_shared.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _shared.py — _shared.py 설명

## 이 파일은 무엇을 책임지나

`_shared.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `list_locations`
- `_build_response`
- `to_response`
- `to_response_bulk`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_math.py]] — 여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""inventory 패키지 공용 헬퍼.

- to_response: Inventory ORM → InventoryResponse (stock_math 통일 계산 + locations 포함)
- list_locations: item_id 의 InventoryLocation 행 (수량 > 0) 을 응답 모델로
- PROCESS_TYPE_LABELS / PROCESS_TYPE_ORDER: /summary 에서 사용 (18개 공정코드 단일 기준)
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List

from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation
from app.schemas import InventoryLocationResponse, InventoryResponse
from app.services import stock_math


# 18개 공정코드 단일 기준 라벨 (README/docs/ITEM_CODE_RULES.md 기준).
# 부서 prefix 6개 × 단계 suffix 3개 = 18.
PROCESS_TYPE_LABELS: dict[str, str] = {
    "TR": "튜브 원자재",
    "TA": "튜브 중간공정",
    "TF": "튜브 공정완료",
    "HR": "고압 원자재",
    "HA": "고압 중간공정",
    "HF": "고압 공정완료",
    "VR": "진공 원자재",
    "VA": "진공 중간공정",
    "VF": "진공 공정완료",
    "NR": "튜닝 원자재",
    "NA": "튜닝 중간공정",
    "NF": "튜닝 공정완료",
    "AR": "조립 원자재",
    "AA": "조립 중간공정",
    "AF": "조립 공정완료",
    "PR": "출하 원자재",
    "PA": "출하 중간공정",
    "PF": "출하 공정완료",
}

# README 기준 표시 순서 (튜브/고압/진공/튜닝/조립/출하 × R/A/F).
PROCESS_TYPE_ORDER: list[str] = [
    "TR", "TA", "TF",
    "HR", "HA", "HF",
    "VR", "VA", "VF",
    "NR", "NA", "NF",
    "AR", "AA", "AF",
    "PR", "PA", "PF",
]


def list_locations(db: Session, item_id: uuid.UUID) -> List[InventoryLocationResponse]:
```
