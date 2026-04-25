"""Items router for item master CRUD operations."""

from datetime import UTC, datetime
import csv
from io import StringIO
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.database import get_db
from app.models import CategoryEnum, DepartmentEnum, Inventory, InventoryLocation, Item, ItemModel, LocationStatusEnum
from app.schemas import (
    InventoryLocationResponse,
    ItemCreate,
    ItemResponse,
    ItemUpdate,
    ItemWithInventory,
)
from app.utils.erp_code import infer_process_type, infer_symbol_slot, make_erp_code, next_serial_no, slots_to_model_symbol
from app.models import ProductSymbol
from app.services import inventory as inventory_svc
from app.services import stock_math
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
def create_item(payload: ItemCreate, db: Session = Depends(get_db)):
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

    db.commit()
    db.refresh(item)
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

    if legacy_item_type:
        query = query.filter(Item.legacy_item_type == legacy_item_type)

    if barcode:
        query = query.filter(Item.barcode == barcode)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.erp_code.ilike(pattern),
                Item.spec.ilike(pattern),
                Item.barcode.ilike(pattern),
                Inventory.location.ilike(pattern),
            )
        )

    rows = query.order_by(Item.category, Item.erp_code).offset(skip).limit(limit).all()
    if not rows:
        return []

    # bulk prefetch — N+1 제거. 기존에는 item 1건당 4 쿼리씩 나갔음.
    item_ids = [it.item_id for it, _ in rows]
    figures_map = stock_math.bulk_compute(db, item_ids)

    from decimal import Decimal as _D

    loc_rows = (
        db.query(InventoryLocation)
        .filter(InventoryLocation.item_id.in_(item_ids), InventoryLocation.quantity > 0)
        .all()
    )
    locations_by_item: dict = {}
    for row in loc_rows:
        locations_by_item.setdefault(row.item_id, []).append(
            InventoryLocationResponse(
                department=row.department,
                status=row.status,
                quantity=row.quantity or _D("0"),
            )
        )

    model_rows = db.query(ItemModel).filter(ItemModel.item_id.in_(item_ids)).all()
    slots_by_item: dict = {}
    for row in model_rows:
        slots_by_item.setdefault(row.item_id, []).append(row.slot)

    return [
        _to_item_with_inventory(
            db,
            item,
            inv,
            figures=figures_map.get(item.item_id),
            locations=locations_by_item.get(item.item_id, []),
            model_slots=slots_by_item.get(item.item_id, []),
        )
        for item, inv in rows
    ]


@router.get("/export.csv")
def export_items_csv(db: Session = Depends(get_db)):
    rows = _build_item_query(db).order_by(Item.erp_code).all()

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["erp_code", "item_name", "category", "spec", "unit", "quantity", "location", "updated_at"])

    for item, inventory in rows:
        writer.writerow(
            [
                item.erp_code or "",
                item.item_name,
                item.category.value,
                item.spec or "",
                item.unit,
                float(inventory.quantity) if inventory else 0,
                inventory.location if inventory else "",
                item.updated_at.isoformat(),
            ]
        )

    return csv_streaming_response(buffer, "items-export.csv")


_CATEGORY_ROW_COLOR = {
    "RM": "D6E8FF",
    "TA": "D6F5F5", "TF": "D6F5F5",
    "HA": "FFF8D6", "HF": "FFF8D6",
    "VA": "EAD6FF", "VF": "EAD6FF",
    "BA": "FFE8D6", "BF": "FFE8D6",
    "FG": "D6F5E0",
    "UK": "EBEBEB",
}


@router.get("/export.xlsx")
def export_items_xlsx(
    category: Optional[CategoryEnum] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    from datetime import date as _date
    from decimal import Decimal as _D
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from app.utils.excel import apply_header, auto_width, make_xlsx_response

    query = _build_item_query(db)
    if category:
        query = query.filter(Item.category == category)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.erp_code.ilike(pattern),
                Item.spec.ilike(pattern),
                Item.barcode.ilike(pattern),
                Inventory.location.ilike(pattern),
            )
        )
    rows = query.order_by(Item.category, Item.erp_code).all()

    # 가용수량 계산: stock_math 를 한 번 bulk 로 불러 경로별 재구현을 피한다.
    figures_map = stock_math.bulk_compute(db, [it.item_id for it, _ in rows])

    wb = Workbook()
    ws = wb.active
    ws.title = "품목 마스터"

    columns = [
        "ERP코드", "품목명", "카테고리", "사양", "단위",
        "재고수량", "가용수량", "예약수량", "위치", "공급업체", "안전재고", "바코드", "수정일",
    ]
    apply_header(ws, columns)

    red_font = Font(color="CC0000", bold=True)

    for item, inventory in rows:
        fig = figures_map.get(item.item_id) or stock_math.StockFigures()
        qty = float(fig.total)
        pending = float(fig.pending)
        available = float(fig.available)
        min_stock = float(item.min_stock) if item.min_stock else None

        row_data = [
            item.erp_code or "",
            item.item_name,
            item.category.value,
            item.spec or "",
            item.unit,
            qty,
            available,
            pending,
            inventory.location if inventory else "",
            item.supplier or "",
            min_stock or "",
            item.barcode or "",
            item.updated_at.strftime("%Y-%m-%d %H:%M") if item.updated_at else "",
        ]
        ws.append(row_data)

        row_idx = ws.max_row
        hex_color = _CATEGORY_ROW_COLOR.get(item.category.value, "FFFFFF")
        row_fill = PatternFill("solid", fgColor=hex_color)
        for cell in ws[row_idx]:
            cell.fill = row_fill

        # 재고수량 < 안전재고이면 빨간 글씨
        qty_cell = ws.cell(row=row_idx, column=6)
        if min_stock and qty < min_stock:
            qty_cell.font = red_font

    auto_width(ws)
    filename = f"items-{_date.today().strftime('%Y%m%d')}.xlsx"
    return make_xlsx_response(wb, filename)


@router.get("/{item_id}", response_model=ItemWithInventory)
def get_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    row = _build_item_query(db).filter(Item.item_id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    item, inventory = row
    return _to_item_with_inventory(db, item, inventory)


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(item_id: uuid.UUID, payload: ItemUpdate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    if payload.item_name is not None:
        item.item_name = payload.item_name
    if payload.spec is not None:
        item.spec = payload.spec
    if payload.category is not None:
        item.category = payload.category
    if payload.unit is not None:
        item.unit = payload.unit
    if payload.barcode is not None:
        item.barcode = payload.barcode
    if payload.legacy_file_type is not None:
        item.legacy_file_type = payload.legacy_file_type
    if payload.legacy_part is not None:
        item.legacy_part = payload.legacy_part
    if payload.legacy_item_type is not None:
        item.legacy_item_type = payload.legacy_item_type
    if payload.legacy_model is not None:
        item.legacy_model = payload.legacy_model
    if payload.supplier is not None:
        item.supplier = payload.supplier
    if payload.min_stock is not None:
        item.min_stock = payload.min_stock

    item.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(item)
    return item
