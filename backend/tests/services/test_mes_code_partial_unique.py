"""items.mes_code 전역 unique — 코드 영구 점유.

활성 품목끼리는 물론, 소프트삭제(deleted_at) 후에도 같은 mes_code 재등록을
차단한다. 삭제된 코드도 이력 추적성을 위해 영구 점유한다(R2-5 회귀).
create_all 이 전역 unique 인덱스를 생성하는지 검증.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

D_ARGS = dict(model_symbol="3", process_type_code="AR", serial_no=1)


def test_active_duplicate_mes_code_blocked(make_item, db_session):
    """둘 다 활성이면 동일 mes_code 차단."""
    make_item(**D_ARGS)
    with pytest.raises(IntegrityError):
        make_item(**D_ARGS)  # flush 에서 unique 위반


def test_soft_deleted_still_blocks_recreate(make_item, db_session):
    """소프트삭제돼도 동일 mes_code 재등록 차단(전역 unique — 코드 영구 점유)."""
    i1 = make_item(**D_ARGS)
    db_session.flush()
    i1.deleted_at = datetime.utcnow()
    db_session.flush()
    # 삭제분도 인덱스에 포함 → 같은 코드 재등록 불가
    with pytest.raises(IntegrityError):
        make_item(**D_ARGS)
        db_session.flush()
