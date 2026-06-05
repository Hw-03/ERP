"""창고 지도 (Warehouse Map) schema."""

from typing import List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# 창고 지도 (Warehouse Map)
# ---------------------------------------------------------------------------
BoxSizeLiteral = Literal["LARGE", "MEDIUM", "SMALL"]


class WarehouseAngleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    rows: int
    layers: int
    jaris_per_cell: int
    pos_x: int
    pos_y: int
    width: int
    height: int
    display_order: int
    is_active: bool


class WarehouseAngleCreate(BaseModel):
    label: str = Field(..., max_length=50)
    rows: int = Field(1, ge=1)
    layers: int = Field(1, ge=1)
    jaris_per_cell: int = Field(3, ge=1)
    pos_x: int = Field(0)
    pos_y: int = Field(0)
    width: int = Field(72, ge=1)
    height: int = Field(60, ge=1)
    display_order: Optional[int] = None


class WarehouseAngleUpdate(BaseModel):
    label: Optional[str] = Field(None, max_length=50)
    rows: Optional[int] = Field(None, ge=1)
    layers: Optional[int] = Field(None, ge=1)
    jaris_per_cell: Optional[int] = Field(None, ge=1)
    pos_x: Optional[int] = None
    pos_y: Optional[int] = None
    width: Optional[int] = Field(None, ge=1)
    height: Optional[int] = Field(None, ge=1)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class WarehouseAngleReorderItem(BaseModel):
    id: int
    display_order: int


class WarehouseAngleReorderPayload(BaseModel):
    items: List[WarehouseAngleReorderItem]


class WarehouseBoxItemPayload(BaseModel):
    item_id: uuid.UUID
    quantity: int = Field(..., ge=0)


class WarehouseBoxCreate(BaseModel):
    angle_id: int
    row_no: int = Field(..., ge=1)
    layer_no: int = Field(..., ge=1)
    jari_index: int = Field(..., ge=0)
    size: BoxSizeLiteral
    items: List[WarehouseBoxItemPayload] = Field(default_factory=list)


class WarehouseBoxUpdate(BaseModel):
    size: Optional[BoxSizeLiteral] = None
    items: Optional[List[WarehouseBoxItemPayload]] = None


class WarehouseBoxItemResponse(BaseModel):
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    quantity: int
    department: Optional[str] = None
    color_hex: Optional[str] = None


class WarehouseBoxResponse(BaseModel):
    box_id: uuid.UUID
    angle_id: int
    row_no: int
    layer_no: int
    jari_index: int
    size: BoxSizeLiteral
    stack_order: int
    items: List[WarehouseBoxItemResponse]


class WarehouseMapResponse(BaseModel):
    angles: List[WarehouseAngleResponse]
    boxes: List[WarehouseBoxResponse]
