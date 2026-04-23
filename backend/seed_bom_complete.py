"""BOM 완성 스크립트.

기존 BOM(130개)은 유지하고, ?F 타입(BF, TF) 품목을 대응하는
상위 어셈블리에 연결하여 제품별 BOM 트리를 완성한다.

연결 규칙:
  BA → BF  (조립 반제품 → 조립 고정형)
  TA → TF  (튜브 반제품 → 튜브 고정형)
  BA → HA, VA, TA  (이미 seed_bom.py에서 일부 생성됨, 보완)

model_symbol 중복 여부로 같은 제품군인지 판별한다.
예) BA model_symbol="346", BF model_symbol="34" → 공통 기호 "3","4" 있으므로 연결.
"""

import os
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import BOM, CategoryEnum, Item


def symbols_overlap(s1: str | None, s2: str | None) -> bool:
    if not s1 or not s2:
        return False
    return bool(set(s1) & set(s2))


def load_existing(db) -> set:
    rows = db.query(BOM.parent_item_id, BOM.child_item_id).all()
    return {(str(p), str(c)) for p, c in rows}


def add_bom(db, existing: set, parent: Item, child: Item, qty: int) -> bool:
    if parent.item_id == child.item_id:
        return False
    key = (str(parent.item_id), str(child.item_id))
    if key in existing:
        return False
    db.add(BOM(
        bom_id=uuid.uuid4(),
        parent_item_id=parent.item_id,
        child_item_id=child.item_id,
        quantity=Decimal(str(qty)),
        unit="EA",
    ))
    existing.add(key)
    return True


def main() -> None:
    db = SessionLocal()
    try:
        ba_items = db.query(Item).filter(Item.category == CategoryEnum.BA).all()
        ta_items = db.query(Item).filter(Item.category == CategoryEnum.TA).all()
        ha_items = db.query(Item).filter(Item.category == CategoryEnum.HA).all()
        va_items = db.query(Item).filter(Item.category == CategoryEnum.VA).all()
        bf_items = db.query(Item).filter(Item.category == CategoryEnum.AF).all()
        tf_items = db.query(Item).filter(Item.category == CategoryEnum.TF).all()
        rm_items = db.query(Item).filter(Item.category == CategoryEnum.RM).all()

        existing = load_existing(db)
        print(f"기존 BOM: {len(existing)}개")

        created_bf = 0
        created_tf = 0
        created_sub = 0

        # BA → BF 연결 (model_symbol 겹치는 것끼리)
        bf_linked: set[str] = set()
        for ba in ba_items:
            for bf in bf_items:
                if symbols_overlap(ba.model_symbol, bf.model_symbol):
                    if add_bom(db, existing, ba, bf, 1):
                        created_bf += 1
                        bf_linked.add(str(bf.item_id))

        # model_symbol이 없는 BF는 model_symbol 없는 BA에 연결
        bf_unlinked = [b for b in bf_items if str(b.item_id) not in bf_linked]
        ba_no_sym = [b for b in ba_items if not b.model_symbol]
        if bf_unlinked and ba_no_sym:
            for bf in bf_unlinked[:20]:  # 최대 20개
                for ba in ba_no_sym[:5]:
                    if add_bom(db, existing, ba, bf, 1):
                        created_bf += 1

        # TA → TF 연결 (model_symbol 겹치는 것끼리)
        tf_linked: set[str] = set()
        for ta in ta_items:
            for tf in tf_items:
                if symbols_overlap(ta.model_symbol, tf.model_symbol):
                    if add_bom(db, existing, ta, tf, 1):
                        created_tf += 1
                        tf_linked.add(str(tf.item_id))

        # model_symbol 없는 TF는 아무 TA에나 연결
        tf_unlinked = [t for t in tf_items if str(t.item_id) not in tf_linked]
        if tf_unlinked and ta_items:
            for tf in tf_unlinked:
                if add_bom(db, existing, ta_items[0], tf, 1):
                    created_tf += 1

        # BA에 아직 HA/VA/TA 서브어셈블리 없는 경우 보완
        # (기존 seed는 10개 BA에만 적용됨 — 나머지 BA도 서브어셈블리 연결)
        for ba in ba_items:
            sym = ba.model_symbol or ""
            # 같은 모델의 HA 연결
            for ha in ha_items:
                if symbols_overlap(sym, ha.model_symbol or ""):
                    if add_bom(db, existing, ba, ha, 1):
                        created_sub += 1
                    break  # BA당 HA 1개만
            # 같은 모델의 VA 연결
            for va in va_items:
                if symbols_overlap(sym, va.model_symbol or ""):
                    if add_bom(db, existing, ba, va, 1):
                        created_sub += 1
                    break
            # 같은 모델의 TA 연결
            for ta in ta_items:
                if symbols_overlap(sym, ta.model_symbol or ""):
                    if add_bom(db, existing, ba, ta, 1):
                        created_sub += 1
                    break

        # HA/VA에 RM 연결 (아직 없는 HA/VA에 한해 소수)
        for ha in ha_items:
            sym = ha.model_symbol or ""
            rm_cands = [r for r in rm_items if symbols_overlap(sym, r.model_symbol or "")]
            if not rm_cands:
                rm_cands = rm_items[:3]
            for rm in rm_cands[:3]:
                if add_bom(db, existing, ha, rm, 2):
                    created_sub += 1

        for va in va_items:
            sym = va.model_symbol or ""
            rm_cands = [r for r in rm_items if symbols_overlap(sym, r.model_symbol or "")]
            if not rm_cands:
                rm_cands = rm_items[:3]
            for rm in rm_cands[:3]:
                if add_bom(db, existing, va, rm, 2):
                    created_sub += 1

        db.commit()
        print(f"추가된 BOM:")
        print(f"  BA → BF: {created_bf}개")
        print(f"  TA → TF: {created_tf}개")
        print(f"  서브어셈블리 보완: {created_sub}개")
        print(f"  합계: {created_bf + created_tf + created_sub}개")
        print(f"전체 BOM: {len(existing)}개")

    finally:
        db.close()


if __name__ == "__main__":
    main()
