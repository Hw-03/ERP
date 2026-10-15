"""Public search configuration reads and explicitly authenticated staff writes."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app._actor import set_actor
from app.database import get_db
from app.models import Employee, Item, ItemAlias, ItemSynonymGroup, ItemSynonymTerm, OperatorSession
from app.routers._errors import http_error
from app.routers.operator_sessions import require_operator_session
from app.schemas.item_search import AliasCreate, SynonymCreate, SynonymUpdate
from app.services import audit
from app.services.item_search import get_search_config
from app.utils.search import normalize_search_text

router = APIRouter()
Operator = Annotated[tuple[Employee, OperatorSession], Depends(require_operator_session)]
Database = Annotated[Session, Depends(get_db)]


def _save(db: Session, request: Request, operator: tuple[Employee, OperatorSession], *,
          action: str, target_type: str, target_id: UUID, summary: str) -> None:
    """Audit and search mutations share the normal revision-producing commit."""
    set_actor(request, operator[0])
    audit.record(db, request=request, action=action, target_type=target_type, target_id=str(target_id),
                 payload_summary=summary, actor_pin_role="operator", actor_employee_code=operator[0].employee_code)
    db.commit()


@router.get("/config")
def config(db: Database) -> dict:
    """Expose the same public read boundary as the item list."""
    return get_search_config(db)


@router.post("/items/{item_id}/aliases")
def add_alias(item_id: UUID, payload: AliasCreate, request: Request, db: Database, operator: Operator) -> dict:
    """Appending the same normalized alias returns the already persisted object."""
    if db.get(Item, item_id) is None:
        raise http_error(404, "NOT_FOUND", "품목을 찾을 수 없습니다.")
    key = normalize_search_text(payload.alias)
    row = db.query(ItemAlias).filter_by(item_id=item_id, normalized_alias=key).one_or_none()
    if row is None:
        try:
            with db.begin_nested():
                row = ItemAlias(item_id=item_id, alias=payload.alias, normalized_alias=key)
                db.add(row)
                db.flush()
        except IntegrityError:
            row = db.query(ItemAlias).filter_by(item_id=item_id, normalized_alias=key).one()
        else:
            _save(db, request, operator, action="item_search.alias_add", target_type="item_alias",
                  target_id=row.alias_id, summary=row.alias)
    return {"alias_id": str(row.alias_id), "alias": row.alias}


@router.delete("/items/{item_id}/aliases/{alias_id}", status_code=204)
def remove_alias(item_id: UUID, alias_id: UUID, request: Request, db: Database, operator: Operator) -> Response:
    """Verify ownership before deleting; retrying an already removed alias is safe."""
    row = db.get(ItemAlias, alias_id)
    if row is not None:
        if row.item_id != item_id:
            raise http_error(404, "NOT_FOUND", "해당 품목의 별칭을 찾을 수 없습니다.")
        summary = row.alias
        db.delete(row)
        _save(db, request, operator, action="item_search.alias_remove", target_type="item_alias",
              target_id=alias_id, summary=summary)
    return Response(status_code=204)


def _terms(db: Session, group_id: UUID, terms: list[str]) -> None:
    """Uniqueness lives in the database so competing writes cannot split groups."""
    db.add_all([ItemSynonymTerm(group_id=group_id, term=term, normalized_term=normalize_search_text(term)) for term in terms])
    db.flush()


@router.post("/synonym-groups")
def add_group(payload: SynonymCreate, request: Request, db: Database, operator: Operator) -> dict:
    """Create an empty-default dictionary group only after an explicit staff write."""
    row = ItemSynonymGroup()
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
            _terms(db, row.group_id, payload.terms)
    except IntegrityError as exc:
        raise http_error(409, "SEARCH_TERM_CONFLICT", "이미 다른 그룹에 등록된 동의어입니다.") from exc
    _save(db, request, operator, action="item_search.group_add", target_type="synonym_group",
          target_id=row.group_id, summary=", ".join(payload.terms))
    return {"group_id": str(row.group_id), "version": row.version, "terms": payload.terms}


@router.put("/synonym-groups/{group_id}")
def replace_group(group_id: UUID, payload: SynonymUpdate, request: Request, db: Database, operator: Operator) -> dict:
    """Claim the expected version atomically before replacing the group's terms."""
    try:
        with db.begin_nested():
            changed = db.execute(update(ItemSynonymGroup).where(ItemSynonymGroup.group_id == group_id,
                ItemSynonymGroup.version == payload.expected_version).values(version=ItemSynonymGroup.version + 1))
            if changed.rowcount != 1:
                raise http_error(409, "SEARCH_VERSION_CONFLICT", "동의어가 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
            db.execute(delete(ItemSynonymTerm).where(ItemSynonymTerm.group_id == group_id))
            _terms(db, group_id, payload.terms)
    except IntegrityError as exc:
        raise http_error(409, "SEARCH_TERM_CONFLICT", "이미 다른 그룹에 등록된 동의어입니다.") from exc
    _save(db, request, operator, action="item_search.group_update", target_type="synonym_group",
          target_id=group_id, summary=", ".join(payload.terms))
    return {"group_id": str(group_id), "version": payload.expected_version + 1, "terms": payload.terms}


@router.delete("/synonym-groups/{group_id}", status_code=204)
def remove_group(group_id: UUID, request: Request, db: Database, operator: Operator,
                 expected_version: int = Query(ge=1)) -> Response:
    """Deletion uses the same atomic optimistic claim as replacement."""
    terms = db.query(ItemSynonymTerm.term).filter(ItemSynonymTerm.group_id == group_id).order_by(
        ItemSynonymTerm.normalized_term).all()
    changed = db.execute(delete(ItemSynonymGroup).where(ItemSynonymGroup.group_id == group_id,
        ItemSynonymGroup.version == expected_version))
    if changed.rowcount != 1:
        raise http_error(409, "SEARCH_VERSION_CONFLICT", "동의어가 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
    _save(db, request, operator, action="item_search.group_remove", target_type="synonym_group",
          target_id=group_id, summary=", ".join(term for (term,) in terms))
    return Response(status_code=204)
