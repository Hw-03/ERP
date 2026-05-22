---
type: file-explanation
source_path: "backend/app/utils/item_code.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# item_code.py — item_code.py 설명

## 이 파일은 무엇을 책임지나

`item_code.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/utils/item_code.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `slots_to_model_symbol`
- `make_item_code`
- `next_serial_no`

## 연결되는 파일

- [[ERP/backend/app/utils/📁_utils]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```python
"""4-part item code generation utility.

Format: {model_symbol}-{process_type}-{serial:04d}[-{option}]
Example: 346-AR-0001, 3-PA-0001-BG, 34-TR-0023
model_symbol = 각 제품 기호를 오름차순 정렬해 연결 (DX3000→"3", ADX4000W→"4", ADX6000→"6")

품목 분류 단일 기준은 process_type_code 18개 (README/docs/ITEM_CODE_RULES.md).
suffix 'F' = F타입(완성/출하성 — 창고 배치 불가).
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

# slot → 표시 기호 (ProductSymbol 테이블의 새 값과 동기화)
SLOT_TO_SYMBOL: dict[int, str] = {
    1: "3",   # DX3000
    2: "7",   # COCOON
    3: "8",   # SOLO
    4: "4",   # ADX4000W
    5: "6",   # ADX6000FB
}


def slots_to_model_symbol(slots: list[int]) -> str:
    """슬롯 목록 → 정렬된 기호 문자열.
    예: [1, 4, 5] → "346" (DX3000 기호"3" + ADX4000W 기호"4" + ADX6000 기호"6")
    """
    symbols = sorted(SLOT_TO_SYMBOL[s] for s in slots if s in SLOT_TO_SYMBOL)
    return "".join(symbols)


def make_item_code(
    model_symbol: str,
    process_type: str,
    serial_no: int,
    option_code: str | None = None,
) -> str:
    """품목 코드 문자열 생성."""
    base = f"{model_symbol}-{process_type}-{serial_no:04d}"
    return f"{base}-{option_code}" if option_code else base


def next_serial_no(model_symbol: str, process_type: str, db: Session) -> int:
    """process_type 카테고리 전역의 최대 serial_no + 1.

    운영 컨벤션: serial 은 process_type 안에서 모델 무관 전역 유일.
    예: AR 카테고리에서 3-AR-0335, 4-AR-0336 처럼 모델이 달라도 시리얼은 겹치지 않게 메김.
    `model_symbol` 인자는 컨텍스트 용도(향후 모델별 카운터 분리 가능성)로 시그니처는 유지하되,
    현재는 카테고리 스코프로만 카운트한다.
    """
    from app.models import Item
    max_s = (
        db.query(func.max(Item.serial_no))
        .filter(Item.process_type_code == process_type)
        .scalar()
```
