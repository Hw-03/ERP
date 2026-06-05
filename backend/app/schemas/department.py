"""부서·제품 모델 schema."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    name: str = Field(..., max_length=50)
    display_order: int = Field(0)
    pin: str = Field(..., description="관리자 PIN")
    color_hex: Optional[str] = Field(None, max_length=7)
    io_enabled: Optional[bool] = True


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    color_hex: Optional[str] = Field(None, max_length=7)
    pin: str = Field(..., description="관리자 PIN")
    io_enabled: Optional[bool] = None


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    display_order: int
    is_active: bool
    color_hex: Optional[str] = None
    io_enabled: bool = True


class DepartmentReorderItem(BaseModel):
    id: int
    display_order: int


class DepartmentReorderPayload(BaseModel):
    items: List[DepartmentReorderItem]
    pin: str


class DepartmentDeleteRequest(BaseModel):
    """DELETE /departments/{id} 의 선택적 body — PIN 을 query 대신 body 로 전달."""

    pin: Optional[str] = Field(None, description="관리자 PIN")


class ProductModelResponse(BaseModel):
    model_config = {"protected_namespaces": (), "from_attributes": True}
    slot: int
    symbol: Optional[str]
    model_name: Optional[str]
    is_reserved: bool
    display_order: int = 0


class ProductModelCreate(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_name: str = Field(..., min_length=1, max_length=50)
    symbol: Optional[str] = Field(None, max_length=5)


class ProductModelUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_name: Optional[str] = Field(None, min_length=1, max_length=50)
    symbol: Optional[str] = Field(None, max_length=5)
    pin: str


class ProductModelReorderItem(BaseModel):
    model_config = {"protected_namespaces": ()}
    slot: int
    display_order: int


class ProductModelReorderPayload(BaseModel):
    model_config = {"protected_namespaces": ()}
    items: List[ProductModelReorderItem]
    pin: str


class ProductModelDeleteRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    pin: str
