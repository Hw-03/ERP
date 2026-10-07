"""불량 사유 선택 검증과 명시적 기본값 시드."""
from __future__ import annotations

import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy.orm import Session
from app.models import DefectReasonCategory
from app.models.defect_reason_category import (
    DEFAULT_DEFECT_REASON_CATEGORIES, defect_reason_category_id, normalize_defect_reason_name,
)


def seed_default_reason_categories(db: Session) -> int:
    """없는 기본 항목만 추가하며 사용자가 변경한 이름·활성 상태는 보존한다."""
    count = 0
    for name in DEFAULT_DEFECT_REASON_CATEGORIES:
        category_id = defect_reason_category_id(name)
        if db.get(DefectReasonCategory, category_id) is not None:
            continue
        normalized = normalize_defect_reason_name(name)
        if db.query(DefectReasonCategory).filter_by(normalized_name=normalized).first():
            continue
        db.add(DefectReasonCategory(category_id=category_id, name=name, normalized_name=normalized, is_active=True, is_other=name == "기타"))
        count += 1
    db.flush()
    return count


def resolve_reason_category(
    db: Session, *, reason_category_id: uuid.UUID | None = None,
    reason_category: str | None = None, reason_memo: str | None = None,
    required: bool = True,
) -> tuple[uuid.UUID | None, str | None, str | None]:
    """제출 시 활성 마스터를 선택해 ID·이름 스냅샷·정리된 메모를 반환한다.

    구형 이름 입력은 등록된 활성 이름만 해석한다. 승인 실행에서는 이 함수를
    호출하지 않고 제출 때 저장한 스냅샷을 그대로 사용한다.
    """
    memo = (reason_memo or "").strip() or None
    if reason_category_id is not None:
        category = db.get(DefectReasonCategory, reason_category_id)
    elif (reason_category or "").strip():
        category = db.query(DefectReasonCategory).filter_by(normalized_name=normalize_defect_reason_name(reason_category)).first()
    else:
        if required:
            raise ValueError("사유 카테고리를 선택하세요.")
        return None, None, memo
    if category is None or not bool(category.is_active):
        raise ValueError("등록된 활성 사유 카테고리를 선택하세요.")
    if required and category.is_other and not memo:
        raise ValueError("기타 사유의 상세 메모를 입력하세요.")
    return category.category_id, category.name, memo


def stock_request_requires_reason(request_type: object) -> bool:
    """불량 등록·처리 요청에만 사유 카테고리 입력을 요구한다."""
    return str(getattr(request_type, "value", request_type)) in {
        "mark_defective_wh", "mark_defective_prod", "defect_scrap", "defect_return",
        "defect_disassemble", "scrap_normal", "return_normal", "rework_normal",
    }


def io_requires_reason(bundles: Iterable[Any]) -> bool:
    """배치에 실제 포함된 불량 라인이 있을 때 헤더 사유를 요구한다."""
    return any(
        getattr(line, "direction", None) == "defective" and getattr(line, "included", True)
        for bundle in bundles for line in bundle.lines
    )
