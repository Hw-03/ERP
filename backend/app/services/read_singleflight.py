"""Share only in-flight read computations; completed results are never retained."""
from __future__ import annotations

from collections.abc import Callable, Hashable
from concurrent.futures import Future
from functools import wraps
from inspect import signature
from threading import Lock
from typing import Any, ParamSpec, TypeVar, cast

from fastapi.params import Param
from sqlalchemy.orm import Session

from app.models import DataRevision

_T = TypeVar("_T")
_P = ParamSpec("_P")
_inflight: dict[Hashable, Future[Any]] = {}
_lock = Lock()


def coalesce_read(db: Session, query_key: Hashable, compute: Callable[[], _T]) -> _T:
    """Share an overlapping pure read for the same bind, revision and immutable query key.

    The caller must include function identity and every result-affecting argument
    in query_key. Return detached response values, never Session-bound ORM objects;
    callers must not mutate the shared result. There is no result cache or TTL.
    """
    with db.no_autoflush:
        revision = db.query(DataRevision.revision).filter(DataRevision.id == 1).scalar()
    if revision is None:
        return compute()
    key = (db.get_bind(), revision, query_key)
    with _lock:
        pending = _inflight.get(key)
        leader = pending is None
        if leader:
            pending = Future()
            _inflight[key] = pending
    if not leader:
        return pending.result()
    try:
        result = compute()
    except BaseException as error:
        with _lock:
            del _inflight[key]
            pending.set_exception(error)
        raise
    with _lock:
        del _inflight[key]
        pending.set_result(result)
    return result


def coalesced_read(function: Callable[_P, _T]) -> Callable[_P, _T]:
    """Preserve FastAPI's signature while sharing identical concurrent read calls.

    Only use on read routes whose immutable query arguments fully determine their
    response. Resolve annotations in the original module before wrapping so
    FastAPI never evaluates their strings in this helper module's namespace.
    """
    resolved_signature = signature(function, eval_str=True)

    @wraps(function)
    def wrapped(*args: _P.args, **kwargs: _P.kwargs) -> _T:
        """Bind all defaults and omit only the request-scoped Session from identity."""
        arguments = resolved_signature.bind(*args, **kwargs)
        arguments.apply_defaults()
        db = arguments.arguments.get("db")
        if not isinstance(db, Session):
            return function(*args, **kwargs)
        query_key = (function, tuple(
            (name, (Param, id(value)) if isinstance(value, Param) else value)
            for name, value in arguments.arguments.items() if name != "db"
        ))
        return coalesce_read(db, query_key, lambda: function(*args, **kwargs))

    cast(Any, wrapped).__signature__ = resolved_signature
    return wrapped
