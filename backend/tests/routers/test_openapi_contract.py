"""공개 OpenAPI 계약의 명칭, 태그, 호환 엔드포인트 메타데이터 검증."""

from __future__ import annotations

import json

from app.main import app


def _has_query_parameter(operation: dict, name: str) -> bool:
    return any(
        parameter["in"] == "query" and parameter["name"] == name
        for parameter in operation.get("parameters", [])
    )


def test_root_and_openapi_use_official_service_name(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["message"] == "DEXCOWIN MES API"
    schema = app.openapi()
    assert schema["info"]["title"] == "DEXCOWIN MES API"
    assert "DEXCOWIN MES API" in schema["info"]["description"]


def test_openapi_tag_metadata_matches_router_tags():
    schema = app.openapi()
    declared_tags = {tag["name"] for tag in schema["tags"]}
    used_tags = {
        tag
        for path_item in schema["paths"].values()
        for operation in path_item.values()
        if isinstance(operation, dict)
        for tag in operation.get("tags", [])
    }

    assert declared_tags == used_tags
    assert "Ship Packages" not in declared_tags
    assert "Variance" not in declared_tags


def test_admin_pin_is_never_advertised_in_query_and_delete_bodies_remain():
    schema = app.openapi()
    integrity_get = schema["paths"]["/api/settings/integrity/inventory"]["get"]
    department_delete = schema["paths"]["/api/departments/{dept_id}"]["delete"]
    model_delete = schema["paths"]["/api/models/{slot}"]["delete"]

    assert integrity_get["deprecated"] is True
    for operation in (integrity_get, department_delete, model_delete):
        assert _has_query_parameter(operation, "pin") is False
        assert "requestBody" in operation


def test_capacity_is_canonical_and_possible_is_deprecated_compatibility_alias(client):
    schema = app.openapi()
    capacity = schema["paths"]["/api/production/capacity"]["get"]
    possible = schema["paths"]["/api/production/possible"]["get"]

    assert capacity.get("deprecated") is not True
    assert capacity["summary"] == "생산 가능 수량 조회"
    assert "생산" in capacity["description"]
    assert possible["deprecated"] is True
    assert "호환" in possible["description"]
    assert capacity["responses"] == possible["responses"]

    canonical_response = client.get("/api/production/capacity")
    compatibility_response = client.get("/api/production/possible")
    assert compatibility_response.status_code == canonical_response.status_code
    assert compatibility_response.json() == canonical_response.json()


def test_item_create_model_slots_description_points_to_dynamic_model_api():
    schema = app.openapi()
    description = schema["components"]["schemas"]["ItemCreate"]["properties"]["model_slots"]["description"]

    assert "GET /api/models" in description
    assert "DX3000" not in description
    assert "COCOON" not in description


def test_process_type_descriptions_use_dynamic_code_source_without_fixed_count():
    schema = app.openapi()
    serialized_schema = json.dumps(schema, ensure_ascii=False)
    item_create = schema["components"]["schemas"]["ItemCreate"]["properties"]["process_type_code"]
    item_update = schema["components"]["schemas"]["ItemUpdate"]["properties"]["process_type_code"]
    item_filter = next(
        parameter
        for parameter in schema["paths"]["/api/items"]["get"]["parameters"]
        if parameter["name"] == "process_type_code"
    )
    inventory_summary = schema["paths"]["/api/inventory/summary"]["get"]

    assert "18개" not in serialized_schema
    assert "18종" not in serialized_schema
    assert "GET /api/codes/process-types" in item_create["description"]
    assert "GET /api/codes/process-types" in item_update["description"]
    assert "GET /api/codes/process-types" in item_filter["description"]
    assert "GET /api/codes/process-types" in inventory_summary["description"]


def test_operator_session_delete_advertises_scoped_pin_change_cancellation():
    operation = app.openapi()["paths"]["/api/operator-session"]["delete"]
    parameter = next(
        item
        for item in operation["parameters"]
        if item["name"] == "pin_change_employee_id"
    )

    assert parameter["in"] == "query"
    assert parameter["required"] is False
    assert {item.get("format") for item in parameter["schema"]["anyOf"]} == {
        "uuid",
        None,
    }
