"""
ERP Master DB — Data Seeding Script
ERP_Master_DB.csv → SQLite (erp.db)

실행:
    cd backend
    python seed.py
"""

import csv
import os
import sys
from decimal import Decimal, InvalidOperation
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

# SQLite 기본값 사용 (DATABASE_URL 미설정 시)
os.environ.setdefault("DATABASE_URL", "sqlite:///./erp.db")

from app.database import SessionLocal, engine, Base
from app.models import Item, Inventory, CategoryEnum

# ---------------------------------------------------------------------------
# 경로: backend/ 한 단계 위의 ERP_Master_DB.csv
# ---------------------------------------------------------------------------
CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "ERP_Master_DB.csv")

CATEGORY_MAP = {
    "RM": CategoryEnum.RM,
    "TA": CategoryEnum.TA,
    "TF": CategoryEnum.TF,
    "HA": CategoryEnum.HA,
    "HF": CategoryEnum.HF,
    "VA": CategoryEnum.VA,
    "VF": CategoryEnum.VF,
    "BA": CategoryEnum.BA,
    "BF": CategoryEnum.BF,
    "FG": CategoryEnum.FG,
    "UK": CategoryEnum.UK,
}

DEFAULT_STOCK = Decimal("100")  # stock_current 없을 때 기본값


def parse_qty(val: str) -> Decimal:
    if not val or val.strip() in ("", "None", "N/A", "-"):
        return Decimal("0")
    try:
        return Decimal(str(val).strip().replace(",", ""))
    except InvalidOperation:
        return Decimal("0")


def run():
    if not os.path.exists(CSV_PATH):
        print(f"❌ CSV 파일을 찾을 수 없습니다: {os.path.abspath(CSV_PATH)}")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(Item).count()
        if existing > 0:
            print(f"⚠️  이미 {existing}개 품목이 있습니다. 전체 삭제 후 재임포트합니다.")
            db.query(Inventory).delete()
            db.query(Item).delete()
            db.commit()

        with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))

        print(f"📂 {len(rows)}개 항목 임포트 시작...\n")

        inserted = 0
        defaulted = 0
        cat_counts: dict[str, int] = {}

        for idx, row in enumerate(rows, 2):
            item_code = (row.get("item_id") or "").strip()
            item_name = (row.get("std_name") or "").strip()
            if not item_name:
                continue
            if not item_code:
                item_code = f"AUTO-{idx:05d}"

            category = CATEGORY_MAP.get(
                (row.get("category_code") or "UK").strip().upper(),
                CategoryEnum.UK,
            )

            # 규격: std_spec 없으면 part_type / maker / model_ref 로 보강
            spec = (row.get("std_spec") or "").strip() or None
            if not spec:
                parts = [
                    row.get("part_type", "").strip(),
                    f"MAKER:{row['maker'].strip()}" if row.get("maker", "").strip() else "",
                    f"MODEL:{row['model_ref'].strip()}" if row.get("model_ref", "").strip() else "",
                ]
                spec = " / ".join(p for p in parts if p) or None

            unit = (row.get("std_unit") or "EA").strip() or "EA"

            # 재고: stock_current → stock_prev → 기본값 100
            qty = parse_qty(row.get("stock_current", ""))
            if qty == 0:
                qty = parse_qty(row.get("stock_prev", ""))
            if qty == 0:
                qty = DEFAULT_STOCK
                defaulted += 1

            now = datetime.utcnow()
            item = Item(
                item_code=item_code,
                item_name=item_name,
                spec=spec,
                category=category,
                unit=unit,
                created_at=now,
                updated_at=now,
            )
            db.add(item)
            db.flush()

            db.add(Inventory(
                item_id=item.item_id,
                quantity=qty,
                location=(row.get("department") or "").strip() or None,
                updated_at=now,
            ))

            inserted += 1
            key = category.value
            cat_counts[key] = cat_counts.get(key, 0) + 1

            if inserted % 100 == 0:
                db.commit()
                print(f"  ... {inserted}건 처리중")

        db.commit()

        # ── 결과 출력 ─────────────────────────────────────────────────────
        order  = ["RM","TA","TF","HA","HF","VA","VF","BA","BF","FG","UK"]
        labels = {
            "RM":"원자재","TA":"튜브반제품","TF":"완성튜브",
            "HA":"고압반제품","HF":"고압완제품","VA":"진공반제품",
            "VF":"진공완제품","BA":"조립반제품","BF":"조립완제품",
            "FG":"출하완제품","UK":"미분류",
        }

        print("\n" + "="*52)
        print("  ✅  임포트 완료!")
        print("="*52)
        print(f"  성공:         {inserted:>5,} 건")
        print(f"  기본재고(100) 적용: {defaulted:>4,} 건")
        print()
        print("  [ 카테고리별 ]")
        for c in order:
            n = cat_counts.get(c, 0)
            if n:
                bar = "█" * (n // 10)
                print(f"    {c} {labels[c]:>6} : {n:>4}건  {bar}")
        print("="*52)
        print(f"\n  DB 파일: {os.path.abspath('erp.db')}")

    except Exception as e:
        db.rollback()
        print(f"\n❌ 오류: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run()
