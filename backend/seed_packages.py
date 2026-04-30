"""출하묶음(ShipPackage) 20개 생성 — 각 패키지에 10개 품목 포함."""
import sys
import os
import random
import uuid
from decimal import Decimal
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import Item, ShipPackage, ShipPackageItem

random.seed(7)

MODEL_NAMES   = ["DX3000", "ADX4000W", "ADX6000FB", "COCOON", "SOLO"]
PACKAGE_TYPES = ["기본 패키지", "표준 세트", "완전 세트", "수출용 패키지", "국내 패키지", "OEM 세트", "A/S 세트"]


def main() -> None:
    db = SessionLocal()
    try:
        all_items = db.query(Item).all()
        if not all_items:
            print("품목 데이터가 없습니다.")
            return

        existing_codes = {p.package_code for p in db.query(ShipPackage).all()}
        created = 0

        for i in range(1, 21):
            code = f"PKG-{i:03d}"
            if code in existing_codes:
                print(f"{code} 이미 존재, 건너뜀.")
                continue

            model = random.choice(MODEL_NAMES)
            name  = f"{model} {random.choice(PACKAGE_TYPES)}"

            now = datetime.utcnow()
            pkg = ShipPackage(
                package_id=uuid.uuid4(),
                package_code=code,
                name=name,
                notes=f"{model} 모델 기준 구성품 묶음",
                created_at=now,
                updated_at=now,
            )
            db.add(pkg)
            db.flush()

            # 10개 품목 무작위 선택 (중복 없이)
            chosen = random.sample(all_items, min(10, len(all_items)))
            seen_ids: set = set()
            for item in chosen:
                if str(item.item_id) in seen_ids:
                    continue
                seen_ids.add(str(item.item_id))
                db.add(ShipPackageItem(
                    package_item_id=uuid.uuid4(),
                    package_id=pkg.package_id,
                    item_id=item.item_id,
                    quantity=Decimal(str(random.randint(1, 5))),
                ))

            existing_codes.add(code)
            created += 1

        db.commit()
        print(f"출하묶음 {created}개 생성 완료 (각 10개 품목).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
