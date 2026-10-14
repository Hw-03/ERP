"""A materialized canonical scope must keep its legacy physical name stable."""

from app.models import Department, InventoryScope


def test_referenced_department_cannot_be_renamed_or_deleted(db_session, client):
    department = Department(name="계수부서", display_order=10, is_active=True)
    db_session.add(department)
    db_session.flush()
    db_session.add(
        InventoryScope(
            scope_key=f"department:{department.id}",
            department_id=department.id,
            physical_department=department.name,
        )
    )
    db_session.commit()

    renamed = client.put(
        f"/api/departments/{department.id}", json={"pin": "0000", "name": "새계수부서"}
    )
    deleted = client.request(
        "DELETE", f"/api/departments/{department.id}", json={"pin": "0000"}
    )

    assert renamed.status_code == 409
    assert deleted.status_code == 409
    db_session.refresh(department)
    assert department.name == "계수부서"


def test_unmapped_legacy_department_can_still_be_renamed(db_session, client):
    department = Department(name="미매핑부서", display_order=10, is_active=True)
    db_session.add(department)
    db_session.commit()

    renamed = client.put(
        f"/api/departments/{department.id}", json={"pin": "0000", "name": "이름수정부서"}
    )
    assert renamed.status_code == 200
