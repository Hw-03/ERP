"""Operator credential writes are not inventory change notifications."""

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models import DataRevision, Employee, OperatorSession
from app.services import realtime
from app.services.operator_session import issue_session


def test_issuing_operator_token_does_not_advance_business_revision():
    engine = create_engine("sqlite://")
    Employee.__table__.create(engine)
    OperatorSession.__table__.create(engine)
    DataRevision.__table__.create(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    with factory() as db:
        db.add(Employee(employee_code="STOCKTAKE-RT", name="계수자", role="시험", department="조립"))
        db.add(DataRevision(id=1, revision=0))
        db.commit()
    realtime.register_session_listeners(factory)
    try:
        with factory() as db:
            employee = db.scalar(select(Employee).where(Employee.employee_code == "STOCKTAKE-RT"))
            issue_session(db, employee=employee, tab_id="tab-a")
            from app.services.operator_session import commit_session_without_realtime

            commit_session_without_realtime(db)
        with engine.connect() as connection:
            assert connection.scalar(select(DataRevision.revision)) == 0
            assert connection.scalar(select(OperatorSession.token_hash)) is not None
    finally:
        realtime.unregister_session_listeners(factory)
        engine.dispose()
