"""4-part ERP code utilities: parse, format, validate, generate.

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
      stripped on display via format_erp_code(compact=True).
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
class ErpCode:
    symbol: str                  # e.g. "3" or "376"
    process_type: str            # e.g. "TR", "PA"
    serial: int                  # integer (no padding)
    option: Optional[str] = None # e.g. "BG" or None
    symbol_slots: List[int] = field(default_factory=list)  # resolved slot ids

    def format(self, *, compact: bool = False) -> str:
        return format_erp_code(self, compact=compact)


# ---------------------------------------------------------------------------
# Parse / Format
# ---------------------------------------------------------------------------


def parse_erp_code(raw: str) -> ErpCode:
    """Parse a 4-part code. Accepts both compact ("3-PA-12-BG") and zero-padded
    ("3-PA-0012-BG") forms. Option segment is optional."""
    if not raw or not isinstance(raw, str):
        raise ValueError("코드 문자열이 비었습니다.")

    tokens = raw.strip().upper().split("-")
    if len(tokens) not in (3, 4):
        raise ValueError(f"코드 토큰 개수가 잘못되었습니다: {raw!r} (3 또는 4개 기대)")

    for tok in tokens:
        if not tok or not CODE_TOKEN_RE.match(tok):
            raise ValueError(f"토큰에 허용되지 않는 문자가 있습니다: {tok!r}")

    symbol, process_type, serial_str = tokens[0], tokens[1], tokens[2]
    option = tokens[3] if len(tokens) == 4 else None

    if not symbol.isdigit():
        raise ValueError(f"제품기호는 숫자만 허용됩니다: {symbol!r}")
    if len(process_type) != 2:
        raise ValueError(f"구분코드는 2자여야 합니다: {process_type!r}")
    try:
        serial = int(serial_str)
    except ValueError as exc:
        raise ValueError(f"일련번호는 정수여야 합니다: {serial_str!r}") from exc
    if serial < 0:
        raise ValueError("일련번호는 0 이상이어야 합니다.")
    if option is not None and len(option) != 2:
        raise ValueError(f"옵션코드는 2자여야 합니다: {option!r}")

    return ErpCode(
        symbol=symbol,
        process_type=process_type,
        serial=serial,
        option=option,
        symbol_slots=_split_symbol(symbol),
    )


def format_erp_code(code: ErpCode, *, compact: bool = False) -> str:
    """Render to canonical string. compact=True drops leading zeros on serial."""
    if compact:
        serial_part = str(code.serial)
    else:
        serial_part = f"{code.serial:0{SERIAL_PAD_WIDTH}d}"
    parts = [code.symbol, code.process_type, serial_part]
    if code.option:
        parts.append(code.option)
    return "-".join(parts)


def _split_symbol(symbol: str) -> List[int]:
    """Treat each digit in symbol as a slot id (symbol matches the slot digit).

    NOTE: Current scheme uses digits 0-9 only. Symbol "376" => slots [3, 7, 6].
    """
    return [int(ch) for ch in symbol]


# ---------------------------------------------------------------------------
# Validation against master tables
# ---------------------------------------------------------------------------


def validate_code(db: Session, code: ErpCode) -> None:
    """Raise ValueError if any part does not match master tables or rules."""
    # Symbol: every digit must map to an assigned (non-reserved) product_symbol
    for digit in code.symbol:
        slot_row = (
            db.query(ProductSymbol)
            .filter(ProductSymbol.symbol == digit)
            .one_or_none()
        )
        if slot_row is None or slot_row.is_reserved:
            raise ValueError(
                f"제품기호 '{digit}' 이(가) 배정되지 않았거나 예약석입니다."
            )

    # Process type must exist
    ptype = db.query(ProcessType).filter(ProcessType.code == code.process_type).one_or_none()
    if ptype is None:
        raise ValueError(f"구분코드 '{code.process_type}' 은(는) 정의되지 않았습니다.")

    # PA/AA must use a single-slot symbol with is_finished_good=True
    if code.process_type in ("PA", "AA"):
        if len(code.symbol) != 1:
            raise ValueError(
                f"완제품/최종조립체({code.process_type})는 반드시 단일 슬롯 기호만 사용 가능합니다. "
                f"현재: {code.symbol}"
            )
        slot_row = (
            db.query(ProductSymbol).filter(ProductSymbol.symbol == code.symbol).one()
        )
        if not slot_row.is_finished_good:
            raise ValueError(
                f"기호 '{code.symbol}' 은(는) 완제품 배정 슬롯이 아닙니다."
            )

    # Option (if present) must exist
    if code.option:
        opt_row = db.query(OptionCode).filter(OptionCode.code == code.option).one_or_none()
        if opt_row is None:
            raise ValueError(f"옵션코드 '{code.option}' 은(는) 정의되지 않았습니다.")


# ---------------------------------------------------------------------------
# Serial generation
# ---------------------------------------------------------------------------


def next_serial(db: Session, symbol: str, process_type: str) -> int:
    """Return the next available serial for (symbol, process_type), based on
    existing Item.serial_no values under that prefix. Serial is scoped to the
    combination to avoid colliding across product/process dimensions."""
    max_serial = (
        db.query(func.max(Item.serial_no))
        .filter(
            Item.process_type_code == process_type,
            # Items sharing the same symbol prefix
            Item.erp_code.like(f"{symbol}-{process_type}-%"),
        )
        .scalar()
    )
    return int(max_serial or 0) + 1


def generate_code(
    db: Session,
    *,
    symbol: str,
    process_type: str,
    option: Optional[str] = None,
) -> ErpCode:
    """Build a new ErpCode with an auto-assigned serial. Validates against
    master tables before returning."""
    symbol = symbol.strip()
    process_type = process_type.strip().upper()
    option = option.strip().upper() if option else None

    code = ErpCode(
        symbol=symbol,
        process_type=process_type,
        serial=next_serial(db, symbol, process_type),
        option=option,
        symbol_slots=_split_symbol(symbol),
    )
    validate_code(db, code)
    return code
