"""주간보고·공정타입·MES코드·BOM체크·생산능력·역소요 schema."""

from typing import List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


class WeeklyItemReport(BaseModel):
    item_id: str
    mes_code: Optional[str]
    item_name: str
    prev_qty: int
    in_qty: int
    out_qty: int
    current_qty: int
    delta: int


class WeeklyGroupReport(BaseModel):
    process_code: str
    dept_name: str
    label: str
    item_count: int
    prev_qty: int
    in_qty: int
    out_qty: int
    current_qty: int
    delta: int
    items: List[WeeklyItemReport]


class WeeklyWarning(BaseModel):
    level: str
    title: str
    message: str


class WeeklyReportSummary(BaseModel):
    total_current_qty: int
    total_in_qty: int
    total_out_qty: int
    groups_increasing: int
    groups_decreasing: int
    groups_unchanged: int


class WeeklyProductionModelRow(BaseModel):
    model_key: str
    model_label: str
    tf_qty: int
    hf_qty: int
    vf_qty: int
    nf_qty: int
    af_qty: int
    pf_qty: int
    total_qty: int


class WeeklyReportResponse(BaseModel):
    week_start: str
    week_end: str
    groups: List[WeeklyGroupReport]
    summary: WeeklyReportSummary
    warnings: List[WeeklyWarning]
    production_matrix: List[WeeklyProductionModelRow] = []


class ProcessTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    prefix: str
    suffix: str
    stage_order: int
    description: Optional[str]


class MesCodeParseRequest(BaseModel):
    code: str = Field(..., description="3-part 품목 코드 문자열")


class MesCodeGenerateRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=5)
    process_type: str = Field(..., min_length=2, max_length=2)


class MesCodeResponse(BaseModel):
    symbol: str
    process_type: str
    serial: int
    symbol_slots: List[int]
    formatted_full: str       # zero-padded: "3-PA-0012"
    formatted_compact: str    # leading zeros stripped: "3-PA-12"


# =============================================================================
# Phase 5.3-A — 운영 도구 응답 schema (BOM 가능 여부 / 생산 capacity / 정합성)
# =============================================================================
class BomCheckComponent(BaseModel):
    mes_code: Optional[str] = None
    item_name: str
    process_type_code: Optional[str] = None
    unit: str
    required: float
    current_stock: float
    pending: float
    available: float
    shortage: float
    ok: bool


class BomCheckResponse(BaseModel):
    item_id: str
    item_name: str
    quantity_to_produce: float
    can_produce: bool
    components: List[BomCheckComponent]


CapacityStatus = Literal["no_target", "bom_not_registered", "not_producible", "producible"]


class CapacityTopItem(BaseModel):
    item_id: str
    item_name: str
    mes_code: Optional[str] = None
    model_symbol: Optional[str] = Field(
        None,
        description="모델 식별자 (items.model_symbol). 모델 그룹화·대표 PF 선정 기준.",
    )
    is_representative: bool = Field(
        False,
        description="해당 모델의 대표 PF 여부. 1단계: model_symbol 별 자연 정렬 첫 PF.",
    )
    immediate: int = Field(
        ...,
        description="BOM 직계 자식(중간재·반제품)의 available 기준 즉시 생산 가능량.",
    )
    maximum: int = Field(
        ...,
        description="BOM leaf 까지 전개한 모든 하위 자재의 available 기준 이론 최대 생산 가능량.",
    )
    limiting_item: Optional[str] = Field(
        None,
        description="이 완제품의 immediate 를 결정한 가장 부족한 직계 자식 부품명.",
    )


class CapacityResponse(BaseModel):
    """전체 생산 가능 수량 응답.

    - **immediate**: BOM 직계 자식 1단계(AA/TF/HF/VF 등 중간재·반제품)의 가용 재고만으로
      빠르게 만들 수 있는 수량. 각 직계 자식의 available(=warehouse+PRODUCTION-pending)
      을 per-unit 수량으로 나눈 값의 최솟값.
    - **maximum**: leaf 까지 전개한 전체 하위 자재의 available 합계 기준 이론적 최대.
      불량(DEFECTIVE) 재고는 제외.
    """
    immediate: int = Field(
        ...,
        description="직계 자식 available 기준 즉시 생산 가능량 (모든 top_item 합).",
    )
    maximum: int = Field(
        ...,
        description="leaf available 기준 이론 최대 생산 가능량 (모든 top_item 합).",
    )
    limiting_item: Optional[str] = Field(
        None,
        description="immediate 가 가장 작은 top_item 의 직계 자식 병목 부품 이름.",
    )
    status: CapacityStatus = Field(
        "no_target",
        description=(
            "표시 분기용 상태. "
            "no_target=BOM 자체 없음 / bom_not_registered=top item 있지만 BOM 전개 불가 / "
            "not_producible=계산 됐지만 모두 0 / producible=하나 이상 생산 가능."
        ),
    )
    top_items: List[CapacityTopItem] = Field(default_factory=list)
    representative_items: List[CapacityTopItem] = Field(
        default_factory=list,
        description=(
            "모델(model_symbol) 별 대표 PF 만 골라낸 리스트. "
            "프론트 메인 패널/모달 상단은 합계 대신 이 배열을 표시. "
            "정렬: model_symbol 오름차순."
        ),
    )


class BackflushDetail(BaseModel):
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    process_type_code: Optional[str] = None
    required_quantity: int
    stock_before: int
    stock_after: int
