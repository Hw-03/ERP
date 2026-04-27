---
type: code-note
project: ERP
layer: backend
source_path: backend/seed_packages.py
status: active
updated: 2026-04-27
source_sha: 74a515ec3d87
tags:
  - erp
  - backend
  - source-file
  - py
---

# seed_packages.py

> [!summary] 역할
> 원본 프로젝트의 `seed_packages.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/seed_packages.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `2357` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````python
"""출하묶음(ShipPackage) 20개 생성 — 각 패키지에 10개 품목 포함."""
import sys
import os
import random
import uuid
from decimal import Decimal
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import Item, ShipPackage, ShipPackageItem, CategoryEnum

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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
