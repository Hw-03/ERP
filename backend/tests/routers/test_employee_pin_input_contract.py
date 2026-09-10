"""직원 PIN alias와 변경 schema의 ASCII 4자리 입력 계약."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.employee import EmployeePinChangeRequest
from app.schemas.operator_session import (
    OperatorPinChangeCompleteRequest,
    OperatorSessionLoginRequest,
)
from app.services.pin_auth import DEFAULT_PIN, validate_pin


@pytest.mark.parametrize("pin_length", [1, 2, 3, *range(5, 21)])
def test_verify_pin_alias_rejects_non_four_digit_lengths_at_request_boundary(
    client: TestClient,
    pin_length: int,
) -> None:
    boundary_client = TestClient(client.app, raise_server_exceptions=False)
    try:
        response = boundary_client.post(
            f"/api/employees/{uuid.uuid4()}/verify-pin",
            json={"pin": "1" * pin_length},
        )
    finally:
        boundary_client.close()

    assert response.status_code == 422, response.text


@pytest.mark.parametrize("pin", ["１２３４", "١٢٣٤"])
def test_verify_pin_alias_rejects_unicode_digits_at_request_boundary(
    client: TestClient,
    pin: str,
) -> None:
    response = client.post(
        f"/api/employees/{uuid.uuid4()}/verify-pin",
        json={"pin": pin},
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize("pin", ["１２３４", "١٢٣٤"])
def test_validate_pin_rejects_unicode_digits(pin: str) -> None:
    with pytest.raises(ValueError, match="4자리 숫자"):
        validate_pin(pin)


def test_default_reset_pin_satisfies_ascii_employee_pin_contract() -> None:
    validate_pin(DEFAULT_PIN)


@pytest.mark.parametrize("pin", ["１２３４", "١٢٣٤"])
def test_operator_session_schemas_reject_unicode_digits(pin: str) -> None:
    with pytest.raises(ValidationError):
        OperatorSessionLoginRequest(employee_id=uuid.uuid4(), pin=pin)

    with pytest.raises(ValidationError):
        OperatorPinChangeCompleteRequest(employee_id=uuid.uuid4(), new_pin=pin)


def test_openapi_employee_pin_constraints_do_not_drift(client: TestClient) -> None:
    schemas = client.app.openapi()["components"]["schemas"]
    expected = {
        "minLength": 4,
        "maxLength": 4,
        "pattern": r"^[0-9]{4}$",
    }

    for schema_name, field_name in [
        ("PinVerifyRequest", "pin"),
        ("EmployeePinChangeRequest", "current_pin"),
        ("EmployeePinChangeRequest", "new_pin"),
        ("OperatorSessionLoginRequest", "pin"),
        ("OperatorPinChangeCompleteRequest", "new_pin"),
    ]:
        property_schema = schemas[schema_name]["properties"][field_name]
        constraints = {key: property_schema.get(key) for key in expected}

        assert constraints == expected

    assert set(schemas["OperatorPinChangeCompleteRequest"]["required"]) == {
        "employee_id",
        "new_pin",
    }


@pytest.mark.parametrize(
    ("current_pin", "new_pin"),
    [
        ("1", "1357"),
        ("１２３４", "1357"),
        ("2468", "１２３４"),
    ],
)
def test_employee_pin_change_schema_rejects_non_ascii_or_non_four_digit_pin(
    current_pin: str,
    new_pin: str,
) -> None:
    with pytest.raises(ValidationError):
        EmployeePinChangeRequest(current_pin=current_pin, new_pin=new_pin)
