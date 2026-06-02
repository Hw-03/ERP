"""3-part item code generation utility.

Format: {model_symbol}-{process_type}-{serial:04d}
Example: 346-AR-0001, 3-PA-0001, 34-TR-0023
model_symbol = 각 제품 기호를 오름차순 정렬해 연결 (DX3000→"3", ADX4000W→"4", ADX6000→"6")

품목 분류 단일 기준은 process_type_code 18개 (README/docs/ITEM_CODE_RULES.md).
suffix 'F' = F타입(완성/출하성 — 창고 배치 불가).
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

# slot↔표시기호 매핑의 단일 진실은 product_symbols 테이블이다. 파싱 핫패스라 프로세스-로컬
# 캐시에 적재해 두고 읽기만 한다. **요청 처리 도중에는 절대 새 DB 세션을 열지 않는다** —
# 엔진(app.database)이 모든 트랜잭션을 BEGIN IMMEDIATE(쓰기 락)로 시작하므로, 요청이 이미
# 잡은 락 위에서 2번째 세션을 열면 busy_timeout 까지 대기하다 'database is locked' 데드락.
# 캐시는 app startup + 모델 CRUD 시점에 "이미 열린 세션(db)" 으로만 (재)적재한다.
_slot_symbol_cache: dict[str, dict] | None = None

_EMPTY_MAPS: dict[str, dict] = {"slot_to_symbol": {}, "symbol_to_slot": {}}


def refresh_symbol_cache(db) -> None:
    """주어진 세션으로 캐시를 (재)적재. app startup + 모델 CRUD(create/update/delete_model)
    직후 호출 — 요청 핸들러의 세션(db)을 그대로 써서 새 커넥션을 열지 않는다.
    reserved(symbol IS NULL) 행 제외. 회사 규약상 symbol 은 단일 문자.
    """
    global _slot_symbol_cache
    from app.models import ProductSymbol

    rows = (
        db.query(ProductSymbol.slot, ProductSymbol.symbol)
        .filter(ProductSymbol.symbol.isnot(None))
        .all()
    )
    _slot_symbol_cache = {
        "slot_to_symbol": {slot: sym for slot, sym in rows},
        "symbol_to_slot": {sym: slot for slot, sym in rows},
    }


def invalidate_symbol_cache() -> None:
    """캐시 비우기 — 다음 refresh 까지 빈 맵으로 동작(요청 중 재적재하지 않음)."""
    global _slot_symbol_cache
    _slot_symbol_cache = None


def _maps() -> dict[str, dict]:
    """캐시 읽기 — 미적재면 빈 맵. **요청 중 DB 커넥션을 열지 않는다.**"""
    return _slot_symbol_cache if _slot_symbol_cache is not None else _EMPTY_MAPS


def slots_to_model_symbol(slots: list[int]) -> str:
    """슬롯 목록 → 정렬된 기호 문자열.
    예: [1, 4, 5] → "346" (DX3000 기호"3" + ADX4000W 기호"4" + ADX6000 기호"6")
    """
    slot_to_symbol = _maps()["slot_to_symbol"]
    symbols = sorted(slot_to_symbol[s] for s in slots if s in slot_to_symbol)
    return "".join(symbols)


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
    symbol_to_slot = _maps()["symbol_to_slot"]
    slots = {symbol_to_slot[ch] for ch in prefix if ch in symbol_to_slot}
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
