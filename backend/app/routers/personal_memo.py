"""세션으로 인증된 직원 본인의 개인 메모만 조회하고 덮어쓴다."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, OperatorSession, PersonalMemo
from app.routers._errors import ErrorCode, http_error
from app.routers.operator_sessions import require_operator_session
from app.schemas.personal_memo import PersonalMemoResponse, PersonalMemoUpdate
from app.services.realtime import suppress_realtime_revision


router = APIRouter()
Operator = Annotated[tuple[Employee, OperatorSession], Depends(require_operator_session)]


@router.get("", response_model=PersonalMemoResponse)
def get_personal_memo(actor: Operator, db: Session = Depends(get_db)) -> PersonalMemoResponse:
    """미작성 메모도 같은 응답 형태로 반환하며 직원 식별자는 세션만 신뢰한다."""
    memo = db.get(PersonalMemo, actor[0].employee_id)
    return PersonalMemoResponse(
        content=memo.content if memo else "",
        updated_at=memo.updated_at if memo else None,
    )


@router.put("", response_model=PersonalMemoResponse)
def update_personal_memo(
    payload: PersonalMemoUpdate,
    actor: Operator,
    db: Session = Depends(get_db),
) -> PersonalMemoResponse:
    """원자적 upsert로 직원당 한 행만 유지하고 업무 변경 알림을 만들지 않는다."""
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
    statement = insert(PersonalMemo).values(
        employee_id=actor[0].employee_id,
        content=payload.content,
        updated_at=datetime.utcnow(),
    )
    statement = statement.on_conflict_do_update(
        index_elements=[PersonalMemo.employee_id],
        set_={"content": statement.excluded.content, "updated_at": statement.excluded.updated_at},
    ).returning(PersonalMemo.content, PersonalMemo.updated_at)
    try:
        content, updated_at = db.execute(statement).one()
        with suppress_realtime_revision(db):
            db.commit()
    except DBAPIError:
        # 전역 DB 오류 로거가 SQL 바인드값에 포함된 개인 본문을 기록하지 않게 한다.
        db.rollback()
        raise http_error(503, ErrorCode.DB_UNAVAILABLE, "개인 메모를 저장하지 못했습니다. 다시 시도해 주세요.") from None
    return PersonalMemoResponse(content=content, updated_at=updated_at)
