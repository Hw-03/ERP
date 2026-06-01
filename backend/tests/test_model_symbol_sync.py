"""드리프트 가드 — utils/mes_code.SLOT_TO_SYMBOL(파싱 핫패스 미러)가
product_symbols 마스터 시드(_PRODUCT_SYMBOL_ASSIGNED)와 일치하는지 검증.

회사 규약상 slot↔기호 매핑은 product_symbols 가 단일 소스다. 코드의 SLOT_TO_SYMBOL 은
파싱 성능을 위한 하드코딩 미러이며, 둘이 어긋나면 mes_code 생성/역파싱이 조용히 틀어진다.
DB 없이 두 Python 상수만 비교한다.
"""

from app.utils.mes_code import SLOT_TO_SYMBOL
from bootstrap.seed import _PRODUCT_SYMBOL_ASSIGNED


def test_slot_to_symbol_matches_product_symbol_seed():
    seed_map = {slot: symbol for slot, symbol, _model in _PRODUCT_SYMBOL_ASSIGNED}
    assert SLOT_TO_SYMBOL == seed_map, (
        "utils/mes_code.SLOT_TO_SYMBOL 이 product_symbols 마스터"
        "(bootstrap.seed._PRODUCT_SYMBOL_ASSIGNED) 와 어긋났습니다 — 둘 중 하나를 갱신해 동기화하세요."
    )
