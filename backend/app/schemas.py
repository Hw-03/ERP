"""Pydantic schemas for the DEXCOWIN MES API."""

from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, WithJsonSchema

from app.models import (
    EmployeeLevelEnum,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionTypeEnum,
)


def _serialize_datetime_with_utc(dt: datetime) -> str:
    """Serialize naive datetime with +00:00 UTC offset."""
    if dt.tzinfo is None:
        return dt.isoformat() + "+00:00"
    return dt.isoformat()


UtcDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_datetime_with_utc, return_type=str),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]


class ItemCreate(BaseModel):
    item_name: str = Field(..., max_length=200, description="품목명")
    process_type_code: Optional[str] = Field(None, max_length=2, description="공정 코드 (TR/HR/.../PF 18개)")
    unit: str = Field("EA", max_length=20, description="단위")
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[int] = None
    initial_quantity: Optional[int] = Field(None, description="초기 재고 수량 (기본 0)")
    model_slots: List[int] = Field(default=[], description="사용 제품 슬롯 목록 (1=DX3000, 2=COCOON, 3=SOLO, 4=ADX4000W, 5=ADX6000)")


class ItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, max_length=200)
    process_type_code: Optional[str] = Field(None, max_length=2, description="공정 코드 (TR/HR/.../PF 18개)")
    unit: Optional[str] = Field(None, max_length=20)
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[int] = None
    mes_code: Optional[str] = Field(None, max_length=40)
    model_slots: Optional[List[int]] = None


class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: uuid.UUID
    item_name: str
    unit: str
    legacy_part: Optional[str] = None
    legacy_item_type: Optional[str] = None
    supplier: Optional[str] = None
    min_stock: Optional[int] = None
    # item code fields
    mes_code: Optional[str] = None
    model_symbol: Optional[str] = None
    model_slots: List[int] = []
    process_type_code: Optional[str] = None
    serial_no: Optional[int] = None
    bom_completed_at: Optional[UtcDatetime] = None
    deleted_at: Optional[UtcDatetime] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class InventoryLocationResponse(BaseModel):
    """부서×상태(생산/불량) 단위 재고 분포."""
    department: str
    status: LocationStatusEnum
    quantity: int


class ItemWithInventory(ItemResponse):
    quantity: Optional[int] = 0
    warehouse_qty: int = 0
    production_total: int = 0
    defective_total: int = 0
    pending_quantity: int = 0
    available_quantity: int = 0
    last_reserver_name: Optional[str] = None
    location: Optional[str] = None
    locations: List[InventoryLocationResponse] = []
    department: Optional[str] = None


class PinVerifyRequest(BaseModel):
    # 작업자 식별용 PIN 검증 요청 — 실제 보안 인증이 아님
    pin: str = Field(..., min_length=1, max_length=20)


class EmployeePinResetRequest(BaseModel):
    # 직원 PIN 초기화 — 관리자 PIN 검증 필요
    pin: str = Field(..., min_length=1, max_length=32)


class EmployeePinChangeRequest(BaseModel):
    # 본인 PIN 변경 — 현재 PIN 검증 필요
    current_pin: str = Field(..., min_length=1, max_length=4)
    new_pin: str = Field(..., min_length=4, max_length=4)


class EmployeeCreate(BaseModel):
    employee_code: Optional[str] = Field(None, max_length=30)
    name: str = Field(..., max_length=100)
    role: str = Field(..., max_length=100)
    phone: Optional[str] = Field(None, max_length=30)
    department: str
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF
    warehouse_role: str = Field("none", description="창고 결재 역할 (none/primary/deputy)")
    department_role: str = Field("none", description="부서 결재 역할 (none/primary/deputy)")
    display_order: int = 0
    is_active: bool = True
    # W12-#7: 직원별 입출고 권한. 부서 io_enabled 와 AND 결합.
    io_enabled: Optional[bool] = True
    # 조립 부서 직원의 담당 모델 slot 목록. 리스트 순서 = priority (앞=상위).
    assigned_model_slots: Optional[List[int]] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=30)
    department: Optional[str] = None
    level: Optional[EmployeeLevelEnum] = None
    warehouse_role: Optional[str] = Field(None, description="창고 결재 역할 (none/primary/deputy)")
    department_role: Optional[str] = Field(None, description="부서 결재 역할 (none/primary/deputy)")
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    # W12-#7: 직원별 입출고 권한. None=변경 없음.
    io_enabled: Optional[bool] = None
    # 조립 부서 직원의 담당 모델 slot 목록. None=변경 없음, []=전부 제거.
    assigned_model_slots: Optional[List[int]] = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    employee_id: uuid.UUID
    employee_code: str
    name: str
    role: str
    phone: Optional[str]
    department: str
    level: EmployeeLevelEnum
    warehouse_role: str = "none"
    department_role: str = "none"
    display_order: int
    is_active: bool
    # W12-#7: 직원별 입출고 권한. 마이그레이션 이전 응답 호환을 위해 기본 True.
    io_enabled: bool = True
    created_at: UtcDatetime
    updated_at: UtcDatetime
    pin_last_changed: Optional[UtcDatetime] = None
    pin_is_default: bool = True
    theme: Optional[str] = None
    # 담당 모델 slot 목록 (priority 순서대로 정렬되어 반환됨)
    assigned_model_slots: List[int] = Field(default_factory=list)


class AdminPinVerifyRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)


class AdminPinUpdateRequest(BaseModel):
    current_pin: str = Field(..., min_length=4, max_length=32)
    new_pin: str = Field(..., min_length=4, max_length=32)


class EmployeeThemeUpdate(BaseModel):
    theme: Optional[str] = Field(None, max_length=10)


class IntegrityCheckRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)
    limit: int = Field(100, ge=1, le=2000)


class IntegrityCheckBody(BaseModel):
    """Deprecated GET /integrity/inventory 의 선택적 body — PIN 을 query 대신 body 로 전달."""

    pin: Optional[str] = Field(None, min_length=4, max_length=32)


class InventoryReceive(BaseModel):
    item_id: uuid.UUID = Field(..., description="입고 대상 품목 ID")
    quantity: int = Field(..., gt=0, description="입고 수량")
    location: Optional[str] = Field(None, max_length=100, description="보관 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")
    notes: Optional[str] = Field(None, description="비고")


class InventoryAdjust(BaseModel):
    item_id: uuid.UUID = Field(..., description="재고 조정 대상 품목 ID")
    quantity: int = Field(..., ge=0, description="조정 후 최종 수량")
    reason: str = Field(..., min_length=1, description="조정 사유")
    location: Optional[str] = Field(None, max_length=100, description="보관 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")


class InventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    inventory_id: uuid.UUID
    item_id: uuid.UUID
    quantity: int                              # 총합 (= warehouse + production_total + defective_total)
    warehouse_qty: int = 0
    production_total: int = 0
    defective_total: int = 0
    pending_quantity: int = 0
    available_quantity: int = 0     # warehouse + production - pending (defective 제외)
    last_reserver_name: Optional[str] = None
    location: Optional[str]
    updated_at: UtcDatetime
    locations: List[InventoryLocationResponse] = []


class TransferRequest(BaseModel):
    """창고↔부서 이동 (transfer-to-production / transfer-to-warehouse 공용)."""
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    department: str
    notes: Optional[str] = Field(None, description="비고")
    reference_no: Optional[str] = Field(None, max_length=100)
    produced_by: Optional[str] = Field(None, max_length=100)
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")


class DeptTransferRequest(BaseModel):
    """부서간 이동."""
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    from_department: str
    to_department: str
    notes: Optional[str] = None
    reference_no: Optional[str] = Field(None, max_length=100)
    produced_by: Optional[str] = Field(None, max_length=100)
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")


class MarkDefectiveRequest(BaseModel):
    """불량 등록.

    source: 'warehouse' 또는 'production'
    source=production 일 때 source_department 필수 (어느 부서에서 발견됐는지)
    target_department: 격리될 부서
    """
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    source: str = Field(..., description="warehouse | production")
    source_department: Optional[str] = None
    target_department: str
    reason: Optional[str] = Field(None, description="불량 사유")
    operator: Optional[str] = Field(None, max_length=100)


class SupplierReturnRequest(BaseModel):
    """공급업체 반품: 부서별 DEFECTIVE 차감."""
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    from_department: str
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    operator: Optional[str] = Field(None, max_length=100)
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 operator(produced_by) 자동 설정")


class ProcessTypeSummary(BaseModel):
    process_type_code: str
    label: str
    item_count: int
    total_quantity: int
    warehouse_qty_sum: int = 0
    production_qty_sum: int = 0
    defective_qty_sum: int = 0


class InventorySummaryResponse(BaseModel):
    process_types: List[ProcessTypeSummary]
    total_items: int
    total_quantity: int


class BOMCreate(BaseModel):
    parent_item_id: uuid.UUID = Field(..., description="상위 품목 ID")
    child_item_id: uuid.UUID = Field(..., description="하위 품목 ID")
    quantity: int = Field(..., gt=0, description="필요 수량")
    unit: str = Field("EA", max_length=20, description="수량 단위")
    notes: Optional[str] = Field(None, description="비고")


class BOMUpdate(BaseModel):
    quantity: Optional[int] = Field(None, gt=0)
    unit: Optional[str] = Field(None, max_length=20)


class BomCompletionUpdate(BaseModel):
    completed: bool = Field(..., description="True=완료로 표시, False=완료 해제")


class ItemReorderItem(BaseModel):
    item_id: uuid.UUID
    display_order: int


class ItemReorderPayload(BaseModel):
    items: List[ItemReorderItem]
    pin: str


class BOMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bom_id: uuid.UUID
    parent_item_id: uuid.UUID
    child_item_id: uuid.UUID
    quantity: int
    unit: str
    notes: Optional[str]


class BOMDetailResponse(BaseModel):
    bom_id: uuid.UUID
    parent_item_id: uuid.UUID
    parent_item_name: str
    parent_mes_code: Optional[str]
    child_item_id: uuid.UUID
    child_item_name: str
    child_mes_code: Optional[str]
    quantity: int
    unit: str


class BOMTreeNode(BaseModel):
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    process_type_code: Optional[str] = None
    unit: str
    required_quantity: int
    current_stock: int = 0
    children: List["BOMTreeNode"] = []


BOMTreeNode.model_rebuild()


class ProductionReceiptRequest(BaseModel):
    item_id: uuid.UUID = Field(..., description="생산 입고 대상 품목 ID")
    quantity: int = Field(..., gt=0, description="생산 수량")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="작업자")
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="작업자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")
    notes: Optional[str] = Field(None, description="비고")


class BackflushDetail(BaseModel):
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    process_type_code: Optional[str] = None
    required_quantity: int
    stock_before: int
    stock_after: int


class ProductionReceiptResponse(BaseModel):
    success: bool
    message: str
    produced_item_id: uuid.UUID
    produced_item_name: str
    produced_quantity: int
    reference_no: Optional[str]
    backflushed_components: List[BackflushDetail]
    transaction_ids: List[uuid.UUID]


class TransactionLogUpdate(BaseModel):
    """[Deprecated] notes만 수정. 3차에서 TransactionMetaEditRequest로 교체됨."""
    notes: Optional[str] = Field(None, description="비고 수정")


class TransactionMetaEditRequest(BaseModel):
    """거래 메타데이터(notes/reference_no/produced_by) 수정 요청. reason + PIN 필수."""

    notes: Optional[str] = None
    reference_no: Optional[str] = None
    produced_by: Optional[str] = None
    reason: str = Field(..., min_length=1, description="수정 사유 (필수)")
    edited_by_employee_id: uuid.UUID
    edited_by_pin: str = Field(..., min_length=1, max_length=20)


class TransactionQuantityCorrectionRequest(BaseModel):
    """RECEIVE/SHIP 수량 보정 요청. SHIP은 quantity_change가 음수여야 함."""

    quantity_change: int = Field(..., description="RECEIVE: 양수, SHIP: 음수")
    reason: str = Field(..., min_length=1)
    edited_by_employee_id: uuid.UUID
    edited_by_pin: str = Field(..., min_length=1, max_length=20)


class TransactionEditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    edit_id: uuid.UUID
    original_log_id: uuid.UUID
    edited_by_employee_id: uuid.UUID
    edited_by_name: str
    reason: str
    before_payload: str
    after_payload: str
    correction_log_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime


class TransactionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: uuid.UUID
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    item_process_type_code: Optional[str] = None
    item_unit: str
    transaction_type: TransactionTypeEnum
    quantity_change: int
    quantity_before: Optional[int]
    quantity_after: Optional[int]
    transfer_qty: Optional[int] = None
    reference_no: Optional[str]
    produced_by: Optional[str]
    producer_employee_id: Optional[uuid.UUID] = None
    requester_name: Optional[str] = None
    # 승인자(요청을 수락한 사람). 직접 처리 시 = 요청자.
    approver_name: Optional[str] = None
    notes: Optional[str]
    operation_batch_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime
    edit_count: int = 0  # 3차: 수정 이력 개수


class TransactionQuantityCorrectionResponse(BaseModel):
    """4차 수량 보정 응답. 원본 + 보정 거래 한 쌍."""

    original: TransactionLogResponse
    correction: TransactionLogResponse


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str


# =============================================================================
# M2: Code master schemas (product symbols, process types, options, 4-part code)
# =============================================================================


class ProductSymbolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    slot: int
    symbol: Optional[str]
    model_name: Optional[str]
    is_finished_good: bool
    is_reserved: bool
    notes: Optional[str] = None


class ProductSymbolUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    symbol: Optional[str] = Field(None, max_length=5)
    model_name: Optional[str] = Field(None, max_length=50)
    is_finished_good: Optional[bool] = None
    is_reserved: Optional[bool] = None
    notes: Optional[str] = None


# =============================================================================
# Weekly Report schemas
# =============================================================================


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


class IntegrityCheckResponse(BaseModel):
    """`/api/settings/integrity/inventory` 응답.

    samples 는 InventoryMismatch.to_dict() 의 자유로운 dict — schema 강제 안 함.
    """
    checked: int
    mismatched_count: int
    samples: List[dict]


class IntegrityRepairResponse(BaseModel):
    """`/api/settings/integrity/repair` 응답."""
    checked: int
    mismatched: int
    repaired: int
    dry_run: bool
    samples: List[dict]


# =============================================================================
# Stock requests (작업자 결재 요청 흐름)
# =============================================================================


class StockRequestLineCreate(BaseModel):
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    from_bucket: RequestBucketEnum
    from_department: Optional[str] = None
    to_bucket: RequestBucketEnum
    to_department: Optional[str] = None


class StockRequestCreate(BaseModel):
    requester_employee_id: uuid.UUID
    request_type: StockRequestTypeEnum
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    lines: List[StockRequestLineCreate] = Field(..., min_length=1)
    client_request_id: Optional[str] = Field(None, max_length=64)
    reason_category: Optional[str] = Field(None, max_length=50)
    reason_memo: Optional[str] = None


class StockRequestDraftUpsert(BaseModel):
    """장바구니(DRAFT) upsert 페이로드. lines 는 빈 리스트 허용 — 저장 도중 단계."""
    requester_employee_id: uuid.UUID
    request_type: StockRequestTypeEnum
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    lines: List[StockRequestLineCreate] = Field(default_factory=list)
    reason_category: Optional[str] = Field(None, max_length=50)
    reason_memo: Optional[str] = None


class StockRequestSubmitPayload(BaseModel):
    """장바구니(DRAFT) → 제출 전환 페이로드."""
    requester_employee_id: uuid.UUID


class StockRequestActionRequest(BaseModel):
    """승인/반려/취소 공통 페이로드 — pin 필수."""
    actor_employee_id: uuid.UUID
    pin: str = Field(..., min_length=1, max_length=32)
    reason: Optional[str] = None  # reject 시에만 사용


class StockRequestLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_id: uuid.UUID
    request_id: uuid.UUID
    item_id: uuid.UUID
    item_name_snapshot: str
    mes_code_snapshot: Optional[str] = None
    quantity: int
    from_bucket: RequestBucketEnum
    from_department: Optional[str] = None
    to_bucket: RequestBucketEnum
    to_department: Optional[str] = None
    status: StockRequestStatusEnum
    operation_line_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime


class StockRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    request_id: uuid.UUID
    request_code: Optional[str] = None
    requester_employee_id: uuid.UUID
    requester_name: str
    requester_department: str
    request_type: StockRequestTypeEnum
    status: StockRequestStatusEnum
    requires_warehouse_approval: bool
    reserved_at: Optional[UtcDatetime] = None
    submitted_at: Optional[UtcDatetime] = None
    approved_by_employee_id: Optional[uuid.UUID] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[UtcDatetime] = None
    rejected_by_employee_id: Optional[uuid.UUID] = None
    rejected_by_name: Optional[str] = None
    rejected_at: Optional[UtcDatetime] = None
    rejected_reason: Optional[str] = None
    requires_department_approval: bool = False
    department_approved_by_employee_id: Optional[uuid.UUID] = None
    department_approved_by_name: Optional[str] = None
    department_approved_at: Optional[UtcDatetime] = None
    cancelled_at: Optional[UtcDatetime] = None
    completed_at: Optional[UtcDatetime] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    operation_batch_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    lines: List[StockRequestLineResponse] = []


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    notification_id: uuid.UUID
    recipient_employee_id: uuid.UUID
    type: str
    title: str
    body: Optional[str] = None
    target_tab: Optional[str] = None
    target_section: Optional[str] = None
    related_request_id: Optional[uuid.UUID] = None
    is_read: bool
    created_at: UtcDatetime


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    unread_count: int


class NotificationMarkReadRequest(BaseModel):
    recipient_employee_id: uuid.UUID
    # None 이면 해당 직원의 안 읽은 알림 전체를 읽음 처리.
    notification_ids: Optional[List[uuid.UUID]] = None


class HandoverLineCreate(BaseModel):
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)


class HandoverCreate(BaseModel):
    author_employee_id: uuid.UUID
    to_department: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=200)
    process_content: Optional[str] = None
    product_name: Optional[str] = Field(None, max_length=200)
    doc_date: Optional[UtcDatetime] = None
    analysis_text: Optional[str] = None
    notes: Optional[str] = None
    lines: List[HandoverLineCreate] = Field(default_factory=list)


class HandoverReceiveRequest(BaseModel):
    actor_employee_id: uuid.UUID
    pin: str = Field(..., min_length=1, max_length=32)


class HandoverLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_id: uuid.UUID
    item_id: uuid.UUID
    item_name_snapshot: str
    mes_code_snapshot: Optional[str] = None
    quantity: int


class HandoverResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    handover_id: uuid.UUID
    handover_code: Optional[str] = None
    status: str
    author_employee_id: uuid.UUID
    author_name: str
    from_department: str
    to_department: str
    title: str
    process_content: Optional[str] = None
    product_name: Optional[str] = None
    doc_date: Optional[UtcDatetime] = None
    analysis_text: Optional[str] = None
    notes: Optional[str] = None
    received_by_employee_id: Optional[uuid.UUID] = None
    received_by_name: Optional[str] = None
    received_at: Optional[UtcDatetime] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    lines: List[HandoverLineResponse] = []


class IoPreviewTarget(BaseModel):
    source_kind: str = Field("direct_item", max_length=24)
    item_id: Optional[uuid.UUID] = None
    quantity: int = Field(1, gt=0)


class IoLinePayload(BaseModel):
    line_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str] = None
    unit: str = "EA"
    direction: str
    from_bucket: str
    from_department: Optional[str] = None
    to_bucket: str
    to_department: Optional[str] = None
    quantity: int
    bom_expected: Optional[int] = None
    included: bool = True
    origin: str
    edited: bool = False
    has_children: bool = False
    shortage: int = 0
    exclusion_note: Optional[str] = None


class IoBundlePayload(BaseModel):
    bundle_id: uuid.UUID
    source_kind: str
    title: str
    source_item_id: Optional[uuid.UUID] = None
    source_mes_code: Optional[str] = None
    quantity: int
    expanded_level: int = 1
    lines: List[IoLinePayload] = Field(default_factory=list)


class IoPreviewRequest(BaseModel):
    requester_employee_id: Optional[uuid.UUID] = None
    work_type: str
    sub_type: str
    from_department: Optional[str] = None
    to_department: Optional[str] = None
    targets: List[IoPreviewTarget] = Field(..., min_length=1)


class IoPreviewResponse(BaseModel):
    work_type: str
    sub_type: str
    requires_approval: bool
    bundles: List[IoBundlePayload]


class IoDraftUpsert(BaseModel):
    requester_employee_id: uuid.UUID
    work_type: str
    sub_type: str
    from_department: Optional[str] = None
    to_department: Optional[str] = None
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    client_request_id: Optional[str] = Field(None, max_length=64)
    # 이어 작업 중인 draft의 batch_id. 있으면 해당 draft를 갱신, 없으면 새 슬롯 생성.
    # submit 경로(IoSubmitRequest)는 이 값을 무시한다.
    batch_id: Optional[uuid.UUID] = None
    bundles: List[IoBundlePayload] = Field(default_factory=list)


class IoSubmitRequest(IoDraftUpsert):
    pass


class IoBatchResponse(BaseModel):
    batch_id: uuid.UUID
    work_type: str
    sub_type: str
    status: str
    requester_employee_id: uuid.UUID
    requester_name: str
    requester_department: str
    # 승인자(요청을 수락한 사람). stock_request 경로 → 그 request 의 approved_by. 직접 처리(stock_request 없음) → 요청자 자신.
    approver_employee_id: Optional[uuid.UUID] = None
    approver_name: Optional[str] = None
    from_department: Optional[str] = None
    to_department: Optional[str] = None
    requires_approval: bool
    stock_request_id: Optional[uuid.UUID] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    submitted_at: Optional[UtcDatetime] = None
    completed_at: Optional[UtcDatetime] = None
    bundles: List[IoBundlePayload] = Field(default_factory=list)


class IoSubmitResponse(BaseModel):
    batch: IoBatchResponse
    status: str
    requires_approval: bool
    stock_request_id: Optional[uuid.UUID] = None
    message: str


class ReservationLineResponse(BaseModel):
    """품목별 점유중 라인 — InventoryDetailPanel 표시용."""
    model_config = ConfigDict(from_attributes=True)

    line_id: uuid.UUID
    request_id: uuid.UUID
    request_code: Optional[str] = None
    requester_name: str
    requester_department: str
    quantity: int
    from_bucket: RequestBucketEnum
    to_bucket: RequestBucketEnum
    to_department: Optional[str] = None
    created_at: UtcDatetime


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


class ReconcileRow(BaseModel):
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    placed_total: int
    warehouse_qty: int
    diff: int  # placed_total − warehouse_qty
    status: Literal["ok", "over", "under"]


class ReconcileResponse(BaseModel):
    rows: List[ReconcileRow]
    mismatch_count: int
