"""ERP 4-part code generation utility.

Format: {model_symbol}-{process_type}-{serial:04d}[-{option}]
Example: 346-AR-0001, 3-PA-0001-BG, 34-TR-0023
model_symbol = 각 제품 기호를 오름차순 정렬해 연결 (DX3000→"3", ADX4000W→"4", ADX6000→"6")

품목 분류 단일 기준은 process_type_code 18개 (README/docs/ITEM_CODE_RULES.md).
suffix 'F' = F타입(완성/출하성 — 창고 배치 불가).
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

# legacy_model → product_symbols.slot 매핑 (seed 시 호환용)
LEGACY_MODEL_TO_SLOT: dict[str, int] = {
    "DX3000":    1,
    "COCOON":    2,
    "SOLO":      3,
    "ADX4000W":  4,
    "ADX6000FB": 5,
    "ADX6000":   5,
}

# slot → 표시 기호 (ProductSymbol 테이블의 새 값과 동기화)
SLOT_TO_SYMBOL: dict[int, str] = {
    1: "3",   # DX3000
    2: "7",   # COCOON
    3: "8",   # SOLO
    4: "4",   # ADX4000W
    5: "6",   # ADX6000FB
}


def infer_symbol_slot(legacy_model: str | None) -> int | None:
    """legacy_model 로 product_symbols slot 번호 추론. 공용/null → None."""
    return LEGACY_MODEL_TO_SLOT.get(legacy_model or "")


def slots_to_model_symbol(slots: list[int]) -> str:
    """슬롯 목록 → 정렬된 기호 문자열.
    예: [1, 4, 5] → "346" (DX3000 기호"3" + ADX4000W 기호"4" + ADX6000 기호"6")
    """
    symbols = sorted(SLOT_TO_SYMBOL[s] for s in slots if s in SLOT_TO_SYMBOL)
    return "".join(symbols)


def make_erp_code(
    model_symbol: str,
    process_type: str,
    serial_no: int,
    option_code: str | None = None,
) -> str:
    """ERP 코드 문자열 생성."""
    base = f"{model_symbol}-{process_type}-{serial_no:04d}"
    return f"{base}-{option_code}" if option_code else base


def next_serial_no(model_symbol: str, process_type: str, db: Session) -> int:
    """동일 model_symbol + process_type 조합의 최대 serial_no + 1."""
    from app.models import Item
    max_s = (
        db.query(func.max(Item.serial_no))
        .filter(Item.model_symbol == model_symbol, Item.process_type_code == process_type)
        .scalar()
    )
    return (max_s or 0) + 1
