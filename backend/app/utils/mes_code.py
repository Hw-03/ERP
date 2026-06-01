"""3-part item code generation utility.

Format: {model_symbol}-{process_type}-{serial:04d}
Example: 346-AR-0001, 3-PA-0001, 34-TR-0023
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


# symbol 글자 → slot 역매핑 (SLOT_TO_SYMBOL 의 역). 회사 규약상 단일 문자 고정.
_SYMBOL_TO_SLOT: dict[str, int] = {sym: slot for slot, sym in SLOT_TO_SYMBOL.items()}


def mes_code_to_model_slots(mes_code: str | None) -> list[int]:
    """품목 코드 prefix(첫 '-' 앞 글자열) → 모델 slot 리스트.

    회사 규약상 prefix 각 글자는 ProductSymbol.symbol 과 1:1 대응.
    예: "8-AR-0307" → [3]  (SOLO)
        "78-PR-0042" → [2, 3]  (COCOON + SOLO)
        "34678-PR-0168" → [1, 2, 3, 4, 5]  (전체 공용)

    mes_code 가 None 이거나 '-' 가 없으면 [].
    매칭 안 되는 글자는 무시. 결과는 slot 오름차순, 중복 제거.
    """
    if not mes_code:
        return []
    dash = mes_code.find("-")
    if dash <= 0:
        return []
    prefix = mes_code[:dash]
    slots = {_SYMBOL_TO_SLOT[ch] for ch in prefix if ch in _SYMBOL_TO_SLOT}
    return sorted(slots)


def make_mes_code(
    model_symbol: str,
    process_type: str,
    serial_no: int,
) -> str:
    """품목 코드 문자열 생성."""
    return f"{model_symbol}-{process_type}-{serial_no:04d}"


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
    )
    return (max_s or 0) + 1
