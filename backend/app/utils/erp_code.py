"""ERP 4-part code generation utility.

Format: {symbol}-{process_type}-{serial:04d}[-{option}]
Example: 3-PA-0001-BG, 공-TR-0023, 8-HA-0007
"""

_CATEGORY_TO_PROCESS: dict[str, str | None] = {
    "RM": None,   # legacy_part 보고 판단
    "TA": "TA",
    "TF": "TA",
    "HA": "HA",
    "HF": "HA",
    "VA": "VA",
    "VF": "VA",
    "BA": "AA",
    "BF": "AA",
    "FG": "PA",
    "UK": None,   # 미분류 → 스킵
}

_PART_TO_PROCESS_FOR_RM: dict[str, str] = {
    "자재창고": "TR",
    "고압파트": "HR",
    "진공파트": "VR",
    "조립출하": "AR",
    "튜닝파트": "AR",   # 튜닝에 R타입 없으므로 AR로 분류
    "출하":    "PR",
}

_LEGACY_MODEL_TO_SLOT: dict[str, int] = {
    "DX3000":    1,
    "COCOON":    2,
    "SOLO":      3,
    "ADX4000W":  4,
    "ADX6000FB": 5,
    "ADX6000":   5,
}


def infer_process_type(category_value: str, legacy_part: str | None) -> str | None:
    """category + legacy_part 로 process_type_code 추론."""
    if category_value == "RM":
        return _PART_TO_PROCESS_FOR_RM.get(legacy_part or "", "TR")
    return _CATEGORY_TO_PROCESS.get(category_value)


def infer_symbol_slot(legacy_model: str | None) -> int | None:
    """legacy_model 로 product_symbols slot 번호 추론. 공용/null → None."""
    return _LEGACY_MODEL_TO_SLOT.get(legacy_model or "")


def make_erp_code(
    symbol: str,
    process_type: str,
    serial_no: int,
    option_code: str | None = None,
) -> str:
    """ERP 코드 문자열 생성."""
    base = f"{symbol}-{process_type}-{serial_no:04d}"
    return f"{base}-{option_code}" if option_code else base
