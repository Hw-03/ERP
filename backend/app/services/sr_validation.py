"""StockRequest 검증 함수 — 정책 함수, shape/수량 검증, preflight 재고 확인."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequestLine,
    StockRequestTypeEnum,
    TransactionTypeEnum,
)


# ---------------------------------------------------------------------------
# 정책 상수
# ---------------------------------------------------------------------------

# request_type → 승인 시 호출할 거래 유형 (TransactionLog.transaction_type)
_TX_TYPE_BY_REQUEST: dict[StockRequestTypeEnum, TransactionTypeEnum] = {
    StockRequestTypeEnum.RAW_RECEIVE: TransactionTypeEnum.RECEIVE,
    StockRequestTypeEnum.RAW_SHIP: TransactionTypeEnum.SHIP,
    StockRequestTypeEnum.WAREHOUSE_TO_DEPT: TransactionTypeEnum.TRANSFER_TO_PROD,
    StockRequestTypeEnum.DEPT_TO_WAREHOUSE: TransactionTypeEnum.TRANSFER_TO_WH,
    StockRequestTypeEnum.DEPT_INTERNAL: TransactionTypeEnum.TRANSFER_DEPT,
    StockRequestTypeEnum.MARK_DEFECTIVE_WH: TransactionTypeEnum.MARK_DEFECTIVE,
    StockRequestTypeEnum.MARK_DEFECTIVE_PROD: TransactionTypeEnum.MARK_DEFECTIVE,
    StockRequestTypeEnum.SUPPLIER_RETURN: TransactionTypeEnum.SUPPLIER_RETURN,
    StockRequestTypeEnum.PACKAGE_OUT: TransactionTypeEnum.SHIP,
    # 불량 처리 흐름 — 결재 필요 액션 (세부 로그는 서비스 함수가 직접 생성)
    StockRequestTypeEnum.DEFECT_SCRAP: TransactionTypeEnum.DEFECT_SCRAP,
    StockRequestTypeEnum.DEFECT_RETURN: TransactionTypeEnum.SUPPLIER_RETURN,
    StockRequestTypeEnum.DEFECT_DISASSEMBLE: TransactionTypeEnum.DISASSEMBLE,
    # R 정상 재고 바로 처리 — 기존 거래 유형 재사용(폐기=DEFECT_SCRAP, 반품=SUPPLIER_RETURN)
    StockRequestTypeEnum.SCRAP_NORMAL: TransactionTypeEnum.DEFECT_SCRAP,
    StockRequestTypeEnum.RETURN_NORMAL: TransactionTypeEnum.SUPPLIER_RETURN,
}


# ---------------------------------------------------------------------------
# 정책 함수
# ---------------------------------------------------------------------------


def line_requires_approval(from_bucket: RequestBucketEnum, to_bucket: RequestBucketEnum) -> bool:
    """from/to 중 하나라도 warehouse면 창고 담당자 승인 필요.

    production ↔ production (DEFECTIVE 포함) 만 승인 불필요.
    """
    return RequestBucketEnum.WAREHOUSE in (from_bucket, to_bucket)


def line_requires_pending(from_bucket: RequestBucketEnum, to_bucket: RequestBucketEnum) -> bool:
    """창고 재고를 선점해야 하는 라인은 from_bucket=='warehouse' 인 경우.

    창고 입고(to=warehouse)는 점유 불필요. 부서→창고는 부서 production 점유가 필요하나
    1차 구현에서는 부서 점유를 생략하고 승인 시점 재검증으로 갈음한다.
    """
    return from_bucket == RequestBucketEnum.WAREHOUSE


def request_requires_approval(lines: Sequence[StockRequestLine]) -> bool:
    return any(line_requires_approval(line.from_bucket, line.to_bucket) for line in lines)


# ---------------------------------------------------------------------------
# request_code 생성
# ---------------------------------------------------------------------------


import secrets
from datetime import datetime


def _generate_request_code(ts: datetime) -> str:
    """SR-YYYYMMDD-HHMMSS-XXXXXXXX 형식 (8자리 랜덤 hex, 32비트 엔트로피).

    충돌 확률 약 1/4,294,967,296 수준.
    unique constraint 충돌 시 라우터가 1회 retry 한다.
    """
    suffix = secrets.token_hex(4).upper()
    return f"SR-{ts.strftime('%Y%m%d-%H%M%S')}-{suffix}"


# ---------------------------------------------------------------------------
# 라인 페이로드
# ---------------------------------------------------------------------------


class LineInput:
    """라우터 ↔ 서비스 인터페이스용 단순 컨테이너."""

    __slots__ = ("item_id", "quantity", "from_bucket", "from_department", "to_bucket", "to_department")

    def __init__(
        self,
        *,
        item_id: uuid.UUID,
        quantity: Decimal,
        from_bucket: RequestBucketEnum,
        from_department: Optional[DepartmentEnum],
        to_bucket: RequestBucketEnum,
        to_department: Optional[DepartmentEnum],
    ) -> None:
        self.item_id = item_id
        self.quantity = Decimal(str(quantity))
        self.from_bucket = from_bucket
        self.from_department = from_department
        self.to_bucket = to_bucket
        self.to_department = to_department


# ---------------------------------------------------------------------------
# request_type ↔ bucket/department 조합 사양표
# ---------------------------------------------------------------------------
# 각 request_type 별로 허용되는 from/to bucket 과 department 필수/금지 규칙.
# create_request() 진입부에서 라인별로 검증해 잘못된 조합으로 승인 정책을 우회하는
# 페이로드(예: raw_ship + bucket=none)를 차단한다.

_ALLOWED_SHAPES: dict[StockRequestTypeEnum, dict] = {
    StockRequestTypeEnum.RAW_RECEIVE: {
        "from_bucket": RequestBucketEnum.NONE,
        "to_bucket": RequestBucketEnum.WAREHOUSE,
        "from_dept_required": False,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.RAW_SHIP: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.NONE,
        "from_dept_required": False,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.WAREHOUSE_TO_DEPT: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.PRODUCTION,
        "from_dept_required": False,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.DEPT_TO_WAREHOUSE: {
        "from_bucket": RequestBucketEnum.PRODUCTION,
        "to_bucket": RequestBucketEnum.WAREHOUSE,
        "from_dept_required": True,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.DEPT_INTERNAL: {
        "from_bucket": RequestBucketEnum.PRODUCTION,
        "to_bucket": RequestBucketEnum.PRODUCTION,
        "from_dept_required": True,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.MARK_DEFECTIVE_WH: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.DEFECTIVE,
        "from_dept_required": False,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.MARK_DEFECTIVE_PROD: {
        "from_bucket": RequestBucketEnum.PRODUCTION,
        "to_bucket": RequestBucketEnum.DEFECTIVE,
        "from_dept_required": True,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.SUPPLIER_RETURN: {
        "from_bucket": RequestBucketEnum.DEFECTIVE,
        "to_bucket": RequestBucketEnum.NONE,
        "from_dept_required": True,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.PACKAGE_OUT: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.NONE,
        "from_dept_required": False,
        "to_dept_required": False,
    },
    # 낱개(manual/adjust) 라인 — 어떤 bucket/dept 조합이든 허용 (요청 유형 다양).
    # 실제 재고 변동은 io.py 의 _submit_immediate 가 dept 승인 후 실행한다.
    StockRequestTypeEnum.MANUAL_ADJUSTMENT: None,  # 검증 건너뜀
    # 불량 처리 흐름 — bucket 조합 임의 허용 (서비스 함수가 재고 검증)
    StockRequestTypeEnum.DEFECT_SCRAP: None,
    StockRequestTypeEnum.DEFECT_RETURN: None,
    StockRequestTypeEnum.DEFECT_DISASSEMBLE: None,
    # R 정상 재고 바로 폐기/반품 — bucket(warehouse/production) 임의 허용, 서비스 함수가 재고 검증
    StockRequestTypeEnum.SCRAP_NORMAL: None,
    StockRequestTypeEnum.RETURN_NORMAL: None,
}


# 낱개 라인 origin — 결재 규칙 단일 원천(approval_rules)에서 re-export(stock_requests 가 import).
from app.services.approval_rules import MANUAL_LINE_ORIGINS  # noqa: E402,F401


def validate_line_shape_for_request_type(
    request_type: StockRequestTypeEnum,
    line: LineInput,
) -> None:
    """request_type 과 라인 bucket/department 조합 정합성 검증.

    실패 시 ValueError. 호출자(create_request)가 DB row 생성 전에 호출해야 한다.
    이 검증을 통과하지 못하면 StockRequest row 도, pending_quantity 변경도 발생하지 않는다.
    """
    if request_type not in _ALLOWED_SHAPES:
        # 새 request_type 이 추가됐는데 사양표에 없으면 명시적으로 거부 (안전 우선).
        raise ValueError(f"지원하지 않는 요청 유형: {request_type}")
    spec = _ALLOWED_SHAPES[request_type]
    if spec is None:
        # MANUAL_ADJUSTMENT — bucket/dept 조합 임의 허용
        return

    expected_from = spec["from_bucket"]
    expected_to = spec["to_bucket"]
    if line.from_bucket != expected_from or line.to_bucket != expected_to:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 from_bucket='{expected_from.value}', "
            f"to_bucket='{expected_to.value}' 만 허용합니다 "
            f"(받음: from='{line.from_bucket.value}', to='{line.to_bucket.value}')."
        )

    from_dept_required: bool = spec["from_dept_required"]
    if from_dept_required and line.from_department is None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 from_department 가 필수입니다."
        )
    if not from_dept_required and line.from_department is not None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 from_department 를 받지 않습니다."
        )

    to_dept_required: bool = spec["to_dept_required"]
    if to_dept_required and line.to_department is None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 to_department 가 필수입니다."
        )
    if not to_dept_required and line.to_department is not None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 to_department 를 받지 않습니다."
        )

    # dept_internal 만 추가 규칙: 출발/도착 부서가 같으면 의미 없는 이동.
    if request_type == StockRequestTypeEnum.DEPT_INTERNAL:
        if line.from_department == line.to_department:
            raise ValueError("부서 내부 이동의 출발/도착 부서가 동일합니다.")


# ---------------------------------------------------------------------------
# 내부 헬퍼 — create_request / submit_draft_request 공통 단계
# ---------------------------------------------------------------------------


def _validate_lines(
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    *,
    allow_empty: bool = False,
) -> None:
    """quantity > 0 + shape 검증. 실패 시 ValueError.

    allow_empty=True 면 lines_input 가 비어 있어도 통과 (DRAFT 저장 도중 단계용).
    """
    if not lines_input:
        if allow_empty:
            return
        raise ValueError("요청 라인이 비어 있습니다.")
    for li in lines_input:
        if li.quantity <= 0:
            raise ValueError("수량은 0보다 커야 합니다.")
        validate_line_shape_for_request_type(request_type, li)


def _preflight_inventory_check(
    db: Session,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
) -> None:
    """제출 시점 재고 사전 검증.

    from_bucket==PRODUCTION 이고 승인 필요 라인(dept_to_warehouse 등)에 대해
    부서 생산 재고가 충분한지 확인한다. 부족 시 ValueError.
    창고→부서(from_bucket==WAREHOUSE) 라인은 reserve() 로 이미 보호되므로 제외.
    """
    # (item_id, department) → 요청 합산 수량
    needed: dict[tuple, Decimal] = {}
    for li in lines_input:
        if (
            li.from_bucket == RequestBucketEnum.PRODUCTION
            and line_requires_approval(li.from_bucket, li.to_bucket)
            and li.from_department is not None
        ):
            key = (li.item_id, li.from_department)
            needed[key] = needed.get(key, Decimal("0")) + li.quantity

    if not needed:
        return

    for (item_id, dept), qty in needed.items():
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == dept,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            )
            .first()
        )
        avail = loc.quantity if loc else Decimal("0")
        if avail < qty:
            item = db.query(Item).filter(Item.item_id == item_id).first()
            item_name = item.item_name if item else str(item_id)
            raise ValueError(
                f"부서 생산 재고 부족: {item_name} / {dept} 생산 {avail}개, 요청 {qty}개."
            )


def _preflight_defective_check(
    db: Session,
    lines_input: Sequence[LineInput],
) -> None:
    """from_bucket==DEFECTIVE 라인의 격리 재고 사전 검증.

    부서 격리(InventoryLocation status=DEFECTIVE) 의 수량이 요청 수량 이상인지
    확인. 부족 시 ValueError → 라우터에서 422 매핑.

    DEFECT_SCRAP / DEFECT_RETURN / DEFECT_DISASSEMBLE 처럼 from_bucket=DEFECTIVE
    인 라인이 격리되지 않은 항목을 폐기/반품/분해 하려는 케이스 차단.
    """
    needed: dict[tuple, Decimal] = {}
    for li in lines_input:
        if li.from_bucket == RequestBucketEnum.DEFECTIVE and li.from_department is not None:
            key = (li.item_id, li.from_department)
            needed[key] = needed.get(key, Decimal("0")) + li.quantity

    if not needed:
        return

    for (item_id, dept), qty in needed.items():
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == dept,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .first()
        )
        avail = loc.quantity if loc else Decimal("0")
        if avail < qty:
            item = db.query(Item).filter(Item.item_id == item_id).first()
            item_name = item.item_name if item else str(item_id)
            dept_label = getattr(dept, "value", str(dept))
            raise ValueError(
                f"격리 재고 부족: {item_name} / {dept_label} 불량 {avail}개, 요청 {qty}개."
            )
