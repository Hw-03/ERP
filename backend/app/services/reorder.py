"""범용 display_order 재정렬 서비스.

여러 master 엔티티(Department, ProductSymbol, 추후 ProcessType 등)에서
동일하게 쓰이는 reorder 패턴을 한 곳에 가둔다.
"""
from typing import Any, Iterable, Tuple, Type

from sqlalchemy.orm import Session

from app.routers._errors import ErrorCode, http_error


def reorder_by_display_order(
    db: Session,
    model_class: Type[Any],
    key_field: str,
    items: Iterable[Tuple[Any, int]],
    *,
    order_field: str = "display_order",
) -> int:
    """주어진 (key, order) 쌍에 따라 model_class 의 정렬 컬럼 일괄 갱신.

    - key_field: 식별자 컬럼 이름 (예: "id", "slot", "item_id")
    - items: (key, order) 시퀀스
    - order_field: 갱신할 정렬 컬럼 이름. 기본값 "display_order" — 부서·모델과 호환.
      Item 처럼 컬럼명이 다른 엔티티(`sort_order`)는 명시적으로 전달.
    - 검증:
        * order 음수 거부 → 400 BAD_REQUEST
        * 동일 key 중복 거부 → 400 BAD_REQUEST
        * 존재하지 않는 key 는 silent skip (부분 갱신 허용, 부서·모델 기존 동작 보존)
    - 트랜잭션: 호출자가 commit 책임. 본 함수는 mutation 만 수행.
    - 반환: 실제로 갱신된 row 수.
    """
    items_list = list(items)
    keys = [k for k, _ in items_list]
    if len(set(keys)) != len(keys):
        raise http_error(400, ErrorCode.BAD_REQUEST, "중복된 식별자가 있습니다.")
    for _, order in items_list:
        if order < 0:
            raise http_error(400, ErrorCode.BAD_REQUEST, "display_order 는 음수가 될 수 없습니다.")
    updated = 0
    column = getattr(model_class, key_field)
    for key, order in items_list:
        obj = db.query(model_class).filter(column == key).first()
        if obj is not None:
            setattr(obj, order_field, order)
            updated += 1
    return updated
