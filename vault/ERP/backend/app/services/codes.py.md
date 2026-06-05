---
type: file-explanation
source_path: "backend/app/services/codes.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# codes.py — codes.py 설명

## 이 파일은 무엇을 책임지나

`codes.py`는 `codes` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ItemCode`
- `parse_item_code`
- `format_item_code`
- `_split_symbol`
- `validate_code`
- `next_serial`
- `generate_code`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/routers/codes.py]] — `codes.py`는 `codes` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
"""4-part 품목 코드 utilities: parse, format, validate, generate.

Code format: [제품기호]-[구분코드]-[일련번호]-[옵션코드]

Examples
    376-TR-0012-BG   (raw material shared across DX3000, COCOON, ADX6000FB)
    3-PA-0012-WM     (DX3000 finished good, white matte)

Rules
    - Symbol is a non-empty string composed of single-slot digits (e.g. "3",
      "7", "376"). Multi-digit symbol is a concatenation of slot symbols and
      is allowed only for raw/assembly items shared across products.
    - For PA (최종 완제품) and AA (최종 조립체), symbol MUST be a single slot
      symbol (len == 1 and the symbol maps to a finished-good slot).
    - Process type is always exactly 2 characters from process_types.code.
    - Serial is a zero-padded integer (default width 4). Leading zeros are
      stripped on display via format_item_code(compact=True).
    - Option is exactly 2 characters from option_codes.code, or empty/None
      for items without options.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Item, OptionCode, ProcessType, ProductSymbol


SERIAL_PAD_WIDTH = 4
CODE_TOKEN_RE = re.compile(r"^[0-9A-Za-z]+$")


# ---------------------------------------------------------------------------
# Data transfer object
# ---------------------------------------------------------------------------


@dataclass
class ItemCode:
    symbol: str                  # e.g. "3" or "376"
    process_type: str            # e.g. "TR", "PA"
    serial: int                  # integer (no padding)
    option: Optional[str] = None # e.g. "BG" or None
    symbol_slots: List[int] = field(default_factory=list)  # resolved slot ids

    def format(self, *, compact: bool = False) -> str:
        return format_item_code(self, compact=compact)


# ---------------------------------------------------------------------------
```
