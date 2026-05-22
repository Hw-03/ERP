---
type: file-explanation
source_path: "backend/app/services/seed_cleanup.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# seed_cleanup.py — seed_cleanup.py 설명

## 이 파일은 무엇을 책임지나

`seed_cleanup.py`는 `seed_cleanup` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_parse_erp_code`
- `_load_excel`
- `run_cleanup_import`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models.py]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 파일입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
"""seed_cleanup.py — 722 정리본 엑셀을 DB에 적재하는 호출 가능 서비스.

scripts/dev/import_inventory_cleanup.py 의 핵심 로직 추출.
settings./reset 엔드포인트가 이 함수를 호출한다.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation, Item, LocationStatusEnum

try:
    import openpyxl
except ImportError:
    openpyxl = None  # type: ignore[assignment]

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXCEL_PATH = REPO_ROOT / "outputs" / "inventory_cleanup" / "생산부_재고_매칭작업_정리본.xlsx"

EXPECTED_ROWS = 722
EXPECTED_TOTAL_QTY = Decimal("108924")
DEFAULT_MIN_STOCK = Decimal("200")

DEPT_MAP: dict[str, str] = {
    "T": "튜브",
    "H": "고압",
    "V": "진공",
    "N": "튜닝",
    "A": "조립",
    "P": "출하",
}


def _parse_erp_code(raw: str) -> tuple[str, str, int, str | None]:
    parts = str(raw).strip().split("-")
    if len(parts) < 3:
        raise ValueError(f"품목 코드 형식 오류: {raw!r}")
    model_symbol = parts[0]
    process_type_code = parts[1]
    try:
        serial_no = int(parts[2])
    except ValueError:
        raise ValueError(f"시리얼 번호 파싱 오류: {raw!r}")
    option_code = parts[3] if len(parts) >= 4 else None
    return model_symbol, process_type_code, serial_no, option_code


def _load_excel(excel_path: Path) -> list[dict]:
    if openpyxl is None:
        raise RuntimeError("openpyxl 미설치: pip install openpyxl")
    wb = openpyxl.load_workbook(excel_path)
```
