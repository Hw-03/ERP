"""Competing staff updates must publish one whole group and one audit revision."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app.models import AdminAuditLog, Base, DataRevision, Employee, ItemSynonymGroup, ItemSynonymTerm
from app.routers.item_search import replace_group
from app.schemas.item_search import SynonymUpdate
from app.services.realtime import register_session_listeners, unregister_session_listeners
from app.services import stocktake_guard  # noqa: F401  # install lifecycle hooks before concurrent commits


def test_competing_versions_publish_one_atomic_winner(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'search-concurrent.db').as_posix()}",
                           connect_args={"check_same_thread": False, "timeout": 10})
    @event.listens_for(engine, "connect")
    def enable_fk(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        actor = Employee(employee_code="staff", name="Staff", role="staff")
        group = ItemSynonymGroup()
        db.add_all([actor, group, DataRevision(id=1, revision=0)])
        db.flush()
        group_id, actor_id = group.group_id, actor.employee_id
        db.add_all([ItemSynonymTerm(group_id=group_id, term=term, normalized_term=term.lower())
                    for term in ["Battery", "Power"]])
        db.commit()
    register_session_listeners(factory)
    barrier = Barrier(2)

    def compete(term):
        with factory() as db:
            actor = db.get(Employee, actor_id)
            barrier.wait(timeout=10)
            try:
                result = replace_group(group_id, SynonymUpdate(terms=["Battery", term], expected_version=1),
                    Request({"type": "http", "headers": []}), db, (actor, None))
                return result["version"]
            except HTTPException as exc:
                db.rollback()
                return exc.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(compete, ["Cell", "Unit"]))
        assert sorted(results) == [2, 409]
        with factory() as db:
            assert db.get(ItemSynonymGroup, group_id).version == 2
            assert len(db.query(ItemSynonymTerm).all()) == 2
            assert db.query(AdminAuditLog).count() == 1
            assert db.get(DataRevision, 1).revision == 1
    finally:
        unregister_session_listeners(factory)
        engine.dispose()
