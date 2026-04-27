---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/items.py
status: active
updated: 2026-04-27
source_sha: 4e4521f2a6a8
tags:
  - erp
  - backend
  - router
  - py
---

# items.py

> [!summary] 역할
> FastAPI 라우터 계층의 `items` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/items.py`
- Layer: `backend`
- Kind: `router`
- Size: `15908` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

> 전체 445줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""Items router for item master CRUD operations."""

from datetime import UTC, datetime
import csv
from io import StringIO
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.database import get_db
from app.models import CategoryEnum, DepartmentEnum, Inventory, InventoryLocation, Item, ItemModel, LocationStatusEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    InventoryLocationResponse,
    ItemCreate,
    ItemResponse,
    ItemUpdate,
    ItemWithInventory,
)
from app.utils.erp_code import infer_process_type, infer_symbol_slot, make_erp_code, next_serial_no, slots_to_model_symbol
from app.models import ProductSymbol
from app.services import audit
from app.services import inventory as inventory_svc
from app.services import stock_math
from app.services._tx import commit_and_refresh
from app.services.export_helpers import csv_streaming_response

router = APIRouter()


def _build_item_query(db: Session):
    return db.query(Item, Inventory).outerjoin(Inventory, Item.item_id == Inventory.item_id)


def _to_item_with_inventory(
    db: Session,
    item: Item,
    inventory: Optional[Inventory],
    *,
    figures: Optional[stock_math.StockFigures] = None,
    locations: Optional[list[InventoryLocationResponse]] = None,
    model_slots: Optional[list[int]] = None,
) -> ItemWithInventory:
    """ItemWithInventory DTO 조립.

    성능 모드 (Phase C bulk prefetch 용): 호출측이 figures / locations / model_slots 를
    미리 채워 넣으면 DB 쿼리를 추가로 발생시키지 않는다. 인자를 생략하면 기존처럼
    단건 쿼리를 수행한다 (단건 상세 조회용).
    """
    from decimal import Decimal as _D

    fig = figures if figures is not None else stock_math.compute_for(db, item.item_id)

    if locations is None:
        loc_rows = (
            db.query(InventoryLocation)
            .filter(InventoryLocation.item_id == item.item_id, InventoryLocation.quantity > 0)
            .all()
        )
        locations = [
            InventoryLocationResponse(
                department=row.department,
                status=row.status,
                quantity=row.quantity or _D("0"),
            )
            for row in loc_rows
        ]

    if model_slots is None:
        model_slots = [
            row.slot
            for row in db.query(ItemModel).filter(ItemModel.item_id == item.item_id).all()
        ]

    return ItemWithInventory(
        item_id=item.item_id,
        item_name=item.item_name,
        spec=item.spec,
        category=item.category,
        unit=item.unit,
        barcode=item.barcode,
        legacy_file_type=item.legacy_file_type,
        legacy_part=item.legacy_part,
        legacy_item_type=item.legacy_item_type,
        legacy_model=item.legacy_model,
        supplier=item.supplier,
        min_stock=item.min_stock,
        erp_code=item.erp_code,
        model_symbol=item.model_symbol,
        model_slots=model_slots,
        symbol_slot=item.symbol_slot,
        process_type_code=item.process_type_code,
        option_code=item.option_code,
        serial_no=item.serial_no,
        created_at=item.created_at,
        updated_at=item.updated_at,
        quantity=fig.total,
        warehouse_qty=fig.warehouse_qty,
        production_total=fig.production_total,
        defective_total=fig.defective_total,
        pending_quantity=fig.pending,
        available_quantity=fig.available,
        last_reserver_name=inventory.last_reserver_name if inventory else None,
        location=inventory.location if inventory else None,
        locations=locations,
    )


@router.post("", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, request: Request, db: Session = Depends(get_db)):
    category_val = payload.category.value if payload.category else "UK"

    pt = infer_process_type(category_val, payload.legacy_part)
    model_slots = payload.model_slots or []
    model_sym = slots_to_model_symbol(model_slots) if model_slots else ""
    opt = payload.option_code or None

    serial = None
    erp_code = None
    if pt and model_sym:
        serial = next_serial_no(model_sym, pt, db)
        erp_code = make_erp_code(model_sym, pt, serial, opt)

    # legacy symbol_slot: 단일 모델 지정 시 이전 호환용으로 유지
    legacy_slot = infer_symbol_slot(payload.legacy_model) if not model_slots else (model_slots[0] if len(model_slots) == 1 else None)

    item = Item(
        item_name=payload.item_name,
        spec=payload.spec,
        category=payload.category,
        unit=payload.unit,
        barcode=payload.barcode or None,
        legacy_file_type=payload.legacy_file_type,
        legacy_part=payload.legacy_part,
        legacy_item_type=payload.legacy_item_type,
        legacy_model=payload.legacy_model,
        supplier=payload.supplier,
        min_stock=payload.min_stock,
        process_type_code=pt,
        model_symbol=model_sym or None,
        symbol_slot=legacy_slot,
        serial_no=serial,
        option_code=opt,
        erp_code=erp_code,
    )
    db.add(item)
    db.flush()

    for slot in model_slots:
        db.add(ItemModel(item_id=item.item_id, slot=slot))

    init_qty = payload.initial_quantity if payload.initial_quantity is not None else 0
    inventory = Inventory(item_id=item.item_id, quantity=init_qty, warehouse_qty=init_qty)
    db.add(inventory)

    audit.record(
        db,
        request=request,
        action="item.create",
        target_type="item",
        target_id=str(item.item_id),
        payload_summary=f"{item.item_name} ({item.erp_code or 'no-erp'}, init {init_qty})",
    )

    commit_and_refresh(db, item)
    return item


@router.get("", response_model=List[ItemWithInventory])
def list_items(
    category: Optional[CategoryEnum] = Query(None, description="카테고리 필터"),
    search: Optional[str] = Query(None, description="품목명, 품목코드, 사양, 위치, 바코드 검색"),
    legacy_file_type: Optional[str] = Query(None, description="레거시 파일 구분 필터"),
    legacy_part: Optional[str] = Query(None, description="레거시 파트 필터"),
    legacy_model: Optional[str] = Query(None, description="레거시 모델 필터"),
    department: Optional[str] = Query(None, description="부서 필터 (창고|조립|고압|진공|튜닝|튜브|출하|…)"),
    legacy_item_type: Optional[str] = Query(None, description="레거시 품목 유형 필터"),
    barcode: Optional[str] = Query(None, description="바코드 검색"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    query = _build_item_query(db)

    if category:
        query = query.filter(Item.category == category)

    if legacy_file_type:
        query = query.filter(Item.legacy_file_type == legacy_file_type)

    if legacy_part:
        query = query.filter(Item.legacy_part == legacy_part)

    if legacy_model:
        query = query.filter(Item.legacy_model.ilike(f"%{legacy_model}%"))

    if department:
        if department == "창고":
            # 창고 재고가 1 이상인 품목
            query = query.filter(Inventory.warehouse_qty > 0)
        else:
            try:
                dept_enum = DepartmentEnum(department)
                dept_item_ids = (
                    db.query(InventoryLocation.item_id)
                    .filter(
                        InventoryLocation.department == dept_enum,
                        InventoryLocation.quantity > 0,
                    )
                    .subquery()
                )
                query = query.filter(Item.item_id.in_(dept_item_ids))
            except ValueError:
                pass
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
