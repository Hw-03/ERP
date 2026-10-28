"""Read applied observation work, including unchanged items, without creating logs."""
from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import InventoryOperation, Item, StocktakeApplication, StocktakeApplicationLine, StocktakeCount, StocktakeTarget
from app.schemas.transaction import TransactionDisplayGroupResponse
from app.services.item_search import get_search_config, matches_item_search


def _observation_query(db: Session, *, department: str | None, date_from: date | None,
                       date_to: date | None, operation_keys: str | None,
                       transaction_types: str | None, reference_no: str | None,
                       operation_batch_id: UUID | None,
                       requester_employee_id: UUID | None) -> Query | None:
    """Share work-scope predicates without applying member filters to display groups."""
    from app.routers.inventory._tx_filters import _kst_date_to_utc_naive_bounds
    if reference_no or operation_batch_id or (operation_keys and 'stocktake' not in operation_keys.split(',')):
        return None
    if transaction_types and 'ADJUST' not in transaction_types.split(','):
        return None
    changed = or_(*(StocktakeApplicationLine.before_quantities[key].as_integer() !=
                    StocktakeApplicationLine.after_quantities[key].as_integer()
                    for key in ('normal', 'defect', 'b_grade', 'obsolete')))
    query = (db.query(InventoryOperation, Item, changed.label('changed'), StocktakeTarget.item_name,
                     StocktakeTarget.item_code).select_from(StocktakeApplicationLine)
             .join(StocktakeApplication, StocktakeApplicationLine.application_id == StocktakeApplication.application_id)
             .join(InventoryOperation, StocktakeApplication.operation_id == InventoryOperation.operation_id)
             .join(Item, StocktakeApplicationLine.item_id == Item.item_id)
             .join(StocktakeCount, StocktakeApplicationLine.count_id == StocktakeCount.count_id)
             .join(StocktakeTarget, StocktakeCount.target_id == StocktakeTarget.target_id))
    if date_from:
        query = query.filter(InventoryOperation.effective_at >= _kst_date_to_utc_naive_bounds(date_from)[0])
    if date_to:
        query = query.filter(InventoryOperation.effective_at < _kst_date_to_utc_naive_bounds(date_to + timedelta(days=1))[0])
    if department:
        query = query.filter(func.coalesce(InventoryOperation.department, '창고').in_(department.split(',')))
    if requester_employee_id is not None:
        query = query.filter(InventoryOperation.actor_employee_id == requester_employee_id)
    return query


def _eligible_item_filters(db: Session, *, include_archived: bool, item_id: UUID | None,
                           model: str | None, process_step: str | None) -> list[ColumnElement]:
    """Use identical member eligibility in whole-work displays and numeric aggregates."""
    from app.routers.inventory._tx_filters import _model_filter, _process_step_filter
    clauses = []
    if not include_archived:
        clauses.append(Item.deleted_at.is_(None))
    if item_id:
        clauses.append(Item.item_id == item_id)
    for clause in (_model_filter(db, model), _process_step_filter(process_step)):
        if clause is not None:
            clauses.append(clause)
    return clauses


def observation_department_counts(db: Session, *, search: str | None = None,
                                 department: str | None = None, model: str | None = None,
                                 process_step: str | None = None, date_from: date | None = None,
                                 date_to: date | None = None, operation_keys: str | None = None,
                                 transaction_types: str | None = None, include_archived: bool = False,
                                 requester_employee_id: UUID | None = None) -> dict[str, int]:
    """Count each matching work once; search retains the existing pure alias/synonym rules."""
    query = _observation_query(db, department=department, date_from=date_from, date_to=date_to,
        operation_keys=operation_keys, transaction_types=transaction_types, reference_no=None,
        operation_batch_id=None, requester_employee_id=requester_employee_id)
    if query is None:
        return {}
    query = query.filter(*_eligible_item_filters(db, include_archived=include_archived,
        item_id=None, model=model, process_step=process_step))
    if not search:
        label = func.coalesce(func.nullif(InventoryOperation.department, ''), '창고')
        rows = query.with_entities(label, func.count(func.distinct(InventoryOperation.operation_id))).group_by(label).all()
        return {department: int(count) for department, count in rows}

    config = get_search_config(db)
    synonym_groups = [group['terms'] for group in config['synonym_groups']]
    rows = query.with_entities(InventoryOperation.operation_id, InventoryOperation.department,
        InventoryOperation.actor_name, InventoryOperation.reason, Item.item_id, Item.item_name,
        Item.mes_code, StocktakeTarget.item_name.label('snapshot_name'),
        StocktakeTarget.item_code.label('snapshot_code')).all()
    matched = {}
    for row in rows:
        if row.operation_id in matched:
            continue
        if matches_item_search(search, name_fields=[row.item_name, row.snapshot_name],
                code_fields=[row.mes_code, row.snapshot_code],
                literal_fields=[row.actor_name, row.reason,
                                '재고 전수조사', row.department or '창고'],
                aliases=[alias['alias'] for alias in config['item_aliases'].get(str(row.item_id), [])],
                groups=synonym_groups):
            matched[row.operation_id] = row.department or '창고'
    return dict(Counter(matched.values()))


def observation_groups(db: Session, *, search: str | None = None, department: str | None = None,
                       model: str | None = None, process_step: str | None = None,
                       date_from: date | None = None, date_to: date | None = None,
                       operation_keys: str | None = None, transaction_types: str | None = None,
                       include_archived: bool = False, item_id: Any = None,
                       reference_no: str | None = None, operation_batch_id: Any = None,
                       requester_employee_id: UUID | None = None,
                       search_config: dict | None = None) -> list[TransactionDisplayGroupResponse]:
    """Filter membership first, retain whole operations, and use sealed quantities only."""
    query = _observation_query(db, department=department, date_from=date_from, date_to=date_to,
        operation_keys=operation_keys, transaction_types=transaction_types, reference_no=reference_no,
        operation_batch_id=operation_batch_id, requester_employee_id=requester_employee_id)
    if query is None:
        return []
    rows = query.all()
    if not rows:
        return []
    # Item predicates choose matching members; they never trim a returned operation.
    observed_item_ids = {row[1].item_id for row in rows}
    item_query = db.query(Item.item_id).filter(Item.item_id.in_(observed_item_ids),
        *_eligible_item_filters(db, include_archived=include_archived,
        item_id=item_id, model=model, process_step=process_step))
    eligible = {row[0] for row in item_query.all()}
    search_config = search_config or (get_search_config(db) if search else {"synonym_groups": [], "item_aliases": {}})
    synonym_groups = [group["terms"] for group in search_config["synonym_groups"]]
    grouped = defaultdict(list)
    for row in rows:
        grouped[row[0].operation_id].append(row)
    result = []
    for operation_id, members in grouped.items():
        operation = members[0][0]
        matched = set()
        for _, item, _, snapshot_name, snapshot_code in members:
            if item.item_id in eligible and matches_item_search(search, name_fields=[item.item_name, snapshot_name],
                    code_fields=[item.mes_code, snapshot_code],
                    literal_fields=[operation.actor_name, operation.reason,
                                    '재고 전수조사', operation.department or '창고'],
                    aliases=[row["alias"] for row in search_config["item_aliases"].get(str(item.item_id), [])],
                    groups=synonym_groups):
                matched.add(str(item.item_id))
        if not matched:
            continue
        changed_count = sum(bool(row.changed) for row in members)
        result.append(TransactionDisplayGroupResponse(type='operation', key=str(operation_id), logs=[], stocktake={
            'operation_id': str(operation_id), 'created_at': operation.effective_at.isoformat() + 'Z',
            'actor_name': operation.actor_name, 'department': operation.department or '창고',
            'item_count': len(members), 'matched_item_count': len(matched),
            'filtered_members': bool(search or item_id or model or process_step),
            'matched_item_ids': sorted(matched), 'changed_item_count': changed_count,
            'unchanged_item_count': len(members) - changed_count, 'observations': []}))
    return result


def hydrate_observation_groups(db: Session, groups: list[TransactionDisplayGroupResponse]) -> None:
    """Load immutable quantities for only the selected page, in one batch query."""
    selected = {group.key: group.stocktake for group in groups if group.stocktake}
    if not selected:
        return
    import uuid
    rows = (db.query(StocktakeApplicationLine, StocktakeApplication, Item)
            .join(StocktakeApplication, StocktakeApplicationLine.application_id == StocktakeApplication.application_id)
            .join(Item, StocktakeApplicationLine.item_id == Item.item_id)
            .filter(StocktakeApplication.operation_id.in_([uuid.UUID(key) for key in selected])).all())
    for line, application, item in rows:
        selected[str(application.operation_id)]['observations'].append({
            'row_type': 'STOCKTAKE_OBSERVATION', 'application_id': str(application.application_id),
            'count_id': str(line.count_id), 'confirmation_revision_id': str(line.confirmation_revision_id),
            'item_id': str(item.item_id), 'item_name': item.item_name, 'mes_code': item.mes_code, 'unit': item.unit,
            'scope_key': line.scope_key, 'before_quantities': line.before_quantities,
            'after_quantities': line.after_quantities, 'reservations': line.reservations,
            'observation_epoch_before': line.observation_epoch_before, 'observation_epoch_after': line.observation_epoch_after})
    for work in selected.values():
        work['observations'].sort(key=lambda line: (
            line['item_id'] not in work['matched_item_ids'] if work['filtered_members'] else False,
            line['mes_code'] or '', line['item_id']))
