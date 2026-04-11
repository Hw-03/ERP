"""
ERP Master DB — Data Seeding Script
ERP_Master_DB.csv → PostgreSQL (items + inventory)

실행: python3 seed.py
"""

import csv
import os
import sys
import uuid
from decimal import Decimal, InvalidOperation
from datetime import datetime

# SQLAlchemy 경로 설정
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("DATABASE_URL", "postgresql://erp_user:erp_pass@localhost:5432/erp_db")

from app.database import SessionLocal, engine, Base
from app.models import Item, Inventory, CategoryEnum

# ── CSV 경로 ──────────────────────────────────────────────────────────────
CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "ERP_Master_DB.csv")

# ── CSV category_code → CategoryEnum 매핑 ────────────────────────────────
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

def parse_qty(val: str) -> Decimal:
    """수량 문자열 → Decimal. 빈값/비정상값은 0."""
    if not val or val.strip() in ("", "None", "N/A", "-"):
        return Decimal("0")
    try:
        return Decimal(str(val).strip().replace(",", ""))
    except InvalidOperation:
        return Decimal("0")


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # ── 기존 데이터 확인 ──────────────────────────────────────────────
        existing_count = db.query(Item).count()
        if existing_count > 0:
            print(f"⚠️  이미 {existing_count}개 품목이 DB에 있습니다.")
            answer = input("전체 삭제 후 재임포트할까요? (y/N): ").strip().lower()
            if answer == "y":
                db.query(Inventory).delete()
                db.query(Item).delete()
                db.commit()
                print("  → 기존 데이터 삭제 완료")
            else:
                print("  → 중단합니다.")
                return

        # ── CSV 읽기 ─────────────────────────────────────────────────────
        with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        print(f"\n📂 CSV 로드: {len(rows)}행")
        print(f"📋 컬럼: {list(rows[0].keys())[:10]} ...\n")

        # ── 카운터 ───────────────────────────────────────────────────────
        inserted   = 0
        skipped    = 0
        with_stock = 0
        cat_counts: dict[str, int] = {}
        errors: list[str] = []

        for idx, row in enumerate(rows, start=2):  # CSV 행 번호 (헤더=1)
            item_code = (row.get("item_id") or "").strip()
            item_name = (row.get("std_name") or "").strip()
            cat_code  = (row.get("category_code") or "UK").strip().upper()

            # ── 필수값 검증 ───────────────────────────────────────────────
            if not item_name:
                skipped += 1
                errors.append(f"행{idx}: item_name 없음 ({item_code})")
                continue

            if not item_code:
                item_code = f"AUTO-{idx:05d}"

            category = CATEGORY_MAP.get(cat_code, CategoryEnum.UK)

            # ── spec / unit ───────────────────────────────────────────────
            spec = (row.get("std_spec") or "").strip() or None
            unit = (row.get("std_unit") or "EA").strip() or "EA"

            # spec에 part_type, maker 정보 보강 (규격이 없을 때)
            if not spec:
                extras = []
                if row.get("part_type"):
                    extras.append(row["part_type"].strip())
                if row.get("maker"):
                    extras.append(f"MAKER:{row['maker'].strip()}")
                if row.get("model_ref"):
                    extras.append(f"MODEL:{row['model_ref'].strip()}")
                spec = " / ".join(extras) or None

            # ── 초기 재고: stock_current 우선, 없으면 stock_prev ──────────
            qty_current = parse_qty(row.get("stock_current", ""))
            qty_prev    = parse_qty(row.get("stock_prev", ""))
            initial_qty = qty_current if qty_current > 0 else qty_prev

            if initial_qty > 0:
                with_stock += 1

            # ── Item 중복 체크 (item_code 기준) ───────────────────────────
            existing = db.query(Item).filter(Item.item_code == item_code).first()
            if existing:
                skipped += 1
                continue

            # ── Insert: Item ──────────────────────────────────────────────
            now = datetime.utcnow()
            item = Item(
                item_code   = item_code,
                item_name   = item_name,
                spec        = spec,
                category    = category,
                unit        = unit,
                created_at  = now,
                updated_at  = now,
            )
            db.add(item)
            db.flush()  # item_id 확보

            # ── Insert: Inventory ─────────────────────────────────────────
            inventory = Inventory(
                item_id    = item.item_id,
                quantity   = initial_qty,
                location   = row.get("department", "").strip() or None,
                updated_at = now,
            )
            db.add(inventory)

            inserted += 1
            cat_counts[cat_code] = cat_counts.get(cat_code, 0) + 1

            # 100건마다 중간 커밋 (메모리 절약)
            if inserted % 100 == 0:
                db.commit()
                print(f"  ... {inserted}건 처리중")

        # ── 최종 커밋 ─────────────────────────────────────────────────────
        db.commit()

        # ── 결과 출력 ─────────────────────────────────────────────────────
        print("\n" + "="*55)
        print("  ✅  ERP Master DB 임포트 완료!")
        print("="*55)
        print(f"  총 처리 행:   {len(rows):>6,}건")
        print(f"  성공 임포트:  {inserted:>6,}건")
        print(f"  스킵 (오류):  {skipped:>6,}건")
        print(f"  재고 있는 품목: {with_stock:>5,}건")
        print()
        print("  [카테고리별 임포트 수]")

        # 제조 흐름 순서로 출력
        order = ["RM","TA","TF","HA","HF","VA","VF","BA","BF","FG","UK"]
        labels = {
            "RM":"원자재","TA":"튜브반제품","TF":"완성튜브",
            "HA":"고압반제품","HF":"고압완제품","VA":"진공반제품",
            "VF":"진공완제품","BA":"조립반제품","BF":"조립완제품",
            "FG":"출하완제품","UK":"미분류",
        }
        for c in order:
            cnt = cat_counts.get(c, 0)
            if cnt > 0:
                bar = "█" * (cnt // 10)
                print(f"    {c} ({labels[c]:>6}) : {cnt:>4}건  {bar}")

        if errors:
            print(f"\n  ⚠️  스킵된 항목 ({len(errors)}건):")
            for e in errors[:10]:
                print(f"    - {e}")
            if len(errors) > 10:
                print(f"    ... 외 {len(errors)-10}건")
        print("="*55)

    except Exception as e:
        db.rollback()
        print(f"\n❌ 오류 발생: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run()
