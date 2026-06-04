"""items.mes_code 부분 unique (WHERE deleted_at IS NULL) 회귀 — R2-5.

활성 품목끼리 동일 mes_code 는 차단하되, 소프트삭제(deleted_at) 후에는
같은 코드 재등록을 허용한다. create_all 이 부분 unique 인덱스를 생성하는지 검증.
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
        make_item(**D_ARGS)  # flush 에서 부분 unique 위반


def test_soft_deleted_allows_recreate(make_item, db_session):
    """소프트삭제된 품목과 동일 mes_code 는 재등록 허용(부분 unique 가 삭제분 제외)."""
    i1 = make_item(**D_ARGS)
    db_session.flush()
    i1.deleted_at = datetime.utcnow()
    db_session.flush()
    # 삭제분 제외 → 활성 행은 i2 하나뿐 → 허용
    make_item(**D_ARGS)
    db_session.flush()
