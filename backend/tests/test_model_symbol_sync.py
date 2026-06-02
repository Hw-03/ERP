"""런타임 파생 검증 — slots_to_model_symbol / mes_code_to_model_slots 가
product_symbols 마스터(_PRODUCT_SYMBOL_ASSIGNED, 모델 "9" 포함)와 일치하는지.

하드코딩 미러(구 SLOT_TO_SYMBOL) 제거 후 slot↔기호 단일 진실은 product_symbols 테이블이다.
캐시는 app startup + 모델 CRUD 때 적재되며(요청 중 커넥션 안 엶), 이 테스트는
시드 직후 mc.refresh_symbol_cache(db_session) 로 직접 적재해 파생 결과를 검증한다.
"""

from app.models import ProductSymbol
from app.utils import mes_code as mc
from bootstrap.seed import _PRODUCT_SYMBOL_ASSIGNED


def test_runtime_derivation_matches_master(db_session):
    for slot, symbol, model in _PRODUCT_SYMBOL_ASSIGNED:
        db_session.add(
            ProductSymbol(slot=slot, symbol=symbol, model_name=model, is_reserved=False)
        )
    db_session.commit()
    mc.refresh_symbol_cache(db_session)

    # 각 slot↔기호 양방향 일치 (DX3000/COCOON/SOLO/ADX4000W/ADX6000FB + 모델"9" = slot 6)
    for slot, symbol, _model in _PRODUCT_SYMBOL_ASSIGNED:
        assert mc.slots_to_model_symbol([slot]) == symbol
        assert mc.mes_code_to_model_slots(f"{symbol}-AR-0001") == [slot]

    # 다중 모델 prefix
    assert mc.mes_code_to_model_slots("34678-PR-0001") == [1, 2, 3, 4, 5]
    assert mc.mes_code_to_model_slots("69-AR-0001") == [5, 6]  # ADX6000FB("6") + 모델9("9")

    # 미등록 글자 무시 / None / dash 없음 → []
    assert mc.mes_code_to_model_slots("Z-AR-0001") == []
    assert mc.mes_code_to_model_slots(None) == []
    assert mc.mes_code_to_model_slots("nodash") == []
