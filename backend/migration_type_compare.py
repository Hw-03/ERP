from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.types import TypeDecorator


def compare_migration_type(
    context,
    inspected_column,
    metadata_column,
    inspected_type,
    metadata_type,
) -> bool | None:
    """TypeDecorator의 실제 DB 타입을 기준으로 의미 없는 diff를 제거한다."""
    if not isinstance(metadata_type, TypeDecorator):
        return None

    implementation = metadata_type.load_dialect_impl(context.dialect)
    while isinstance(implementation, TypeDecorator):
        implementation = implementation.impl
    implementation_column = sa.Column(metadata_column.name, implementation)
    return context.impl.compare_type(inspected_column, implementation_column)
