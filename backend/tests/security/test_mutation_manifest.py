"""등록된 HTTP mutation과 VerifiedActor 분류의 양방향 gate."""

from __future__ import annotations

import ast
import importlib
import inspect
import pkgutil
import textwrap
from typing import get_args, get_type_hints

from fastapi.routing import APIRoute
import pytest

from app import services
from app.dependencies.verified_actor import require_verified_actor
from app.main import app
from app.models import Employee
from app.models.base import Base


ACTOR_LIKE_PARAMETER_NAMES = frozenset(
    {"actor", "approver", "author", "canceller", "editor", "employee", "requester"}
)


def _manifest_module():
    try:
        module = importlib.import_module("app.security.mutation_manifest")
    except ModuleNotFoundError:
        module = None
    assert module is not None
    return module


def _has_dependency(dependant, dependency) -> bool:
    return any(
        child.call is dependency or _has_dependency(child, dependency)
        for child in dependant.dependencies
    )


def test_every_registered_mutation_is_in_exactly_one_manifest_class() -> None:
    manifest = _manifest_module()
    actual = {
        (method, route.path)
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
        if method in manifest.MUTATION_METHODS
    }
    classified = manifest.classify_registered_mutations(app)

    assert set(classified) == actual
    assert not (
        manifest.AUTH_BOOTSTRAP_MUTATIONS & manifest.SYSTEM_MUTATION_EXCEPTIONS
    )
    assert manifest.AUTH_BOOTSTRAP_MUTATIONS <= actual
    assert manifest.SYSTEM_MUTATION_EXCEPTIONS <= actual
    assert set(manifest.AUTH_BOOTSTRAP_MUTATION_REASONS) == set(
        manifest.AUTH_BOOTSTRAP_MUTATIONS
    )
    assert set(manifest.SYSTEM_MUTATION_EXCEPTION_REASONS) == set(
        manifest.SYSTEM_MUTATION_EXCEPTIONS
    )
    assert all(manifest.AUTH_BOOTSTRAP_MUTATION_REASONS.values())
    assert all(manifest.SYSTEM_MUTATION_EXCEPTION_REASONS.values())


def test_client_events_is_a_verified_actor_mutation() -> None:
    manifest = _manifest_module()
    key = ("POST", "/api/client-events")

    assert key not in manifest.SYSTEM_MUTATION_EXCEPTIONS
    assert (
        manifest.classify_registered_mutations(app)[key]
        == manifest.MutationClass.VERIFIED_ACTOR
    )


def test_verified_actor_manifest_and_actual_fastapi_dependencies_match() -> None:
    manifest = _manifest_module()
    classified = manifest.classify_registered_mutations(app)

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods & manifest.MUTATION_METHODS:
            key = (method, route.path)
            has_actor = _has_dependency(route.dependant, require_verified_actor)
            expected = classified[key] == manifest.MutationClass.VERIFIED_ACTOR
            assert has_actor is expected, f"{method} {route.path} actor dependency drift"


def _contains_employee_annotation(annotation: object) -> bool:
    return annotation is Employee or any(
        _contains_employee_annotation(argument) for argument in get_args(annotation)
    )


def _actor_parameter_names(function) -> list[str]:
    hints = get_type_hints(function)
    return [
        name
        for name, parameter in inspect.signature(function).parameters.items()
        if name in ACTOR_LIKE_PARAMETER_NAMES
        or _contains_employee_annotation(hints.get(name, parameter.annotation))
    ]


def _discovered_service_actor_candidates() -> dict[str, str]:
    discovered: dict[str, str] = {}
    for module_info in pkgutil.iter_modules(services.__path__):
        module_name = f"{services.__name__}.{module_info.name}"
        module = importlib.import_module(module_name)
        for function_name, function in inspect.getmembers(module, inspect.isfunction):
            if function_name.startswith("_") or function.__module__ != module_name:
                continue
            employee_params = _actor_parameter_names(function)
            if not employee_params:
                continue
            assert len(employee_params) == 1, f"{module_name}.{function_name} actor ambiguity"
            discovered[f"{module_name}.{function_name}"] = employee_params[0]
    return discovered


def _discovered_public_service_functions() -> dict[str, object]:
    """Return each module-owned public service function exactly once."""
    discovered: dict[str, object] = {}
    for module_info in pkgutil.iter_modules(services.__path__):
        if module_info.name.startswith("_"):
            continue
        module_name = f"{services.__name__}.{module_info.name}"
        module = importlib.import_module(module_name)
        for function_name, function in inspect.getmembers(module, inspect.isfunction):
            if function_name.startswith("_") or function.__module__ != module_name:
                continue
            discovered[f"{module_name}.{function_name}"] = function
    return discovered


def _discovered_public_service_reexports() -> dict[str, str]:
    """Map public service aliases to their canonical app.services function."""
    discovered: dict[str, str] = {}
    for module_info in pkgutil.iter_modules(services.__path__):
        if module_info.name.startswith("_"):
            continue
        module_name = f"{services.__name__}.{module_info.name}"
        module = importlib.import_module(module_name)
        for alias_name, function in inspect.getmembers(module, inspect.isfunction):
            target_module = function.__module__
            if (
                alias_name.startswith("_")
                or target_module == module_name
                or not target_module.startswith("app.services.")
            ):
                continue
            discovered[f"{module_name}.{alias_name}"] = (
                f"{target_module}.{function.__name__}"
            )
    return discovered


_DB_WRITE_METHODS = frozenset(
    {
        "add",
        "add_all",
        "bulk_insert_mappings",
        "bulk_save_objects",
        "bulk_update_mappings",
        "commit",
        "delete",
        "flush",
        "merge",
        "rollback",
    }
)
_DML_CALL_NAMES = frozenset({"delete", "insert", "sa_delete", "sa_update", "update"})


def _contains_name(node: ast.AST | None, names: set[str]) -> bool:
    if node is None:
        return False
    return any(isinstance(child, ast.Name) and child.id in names for child in ast.walk(node))


def _contains_dml_call(node: ast.AST) -> bool:
    return any(
        isinstance(child, ast.Call)
        and (
            isinstance(child.func, ast.Name)
            and child.func.id in _DML_CALL_NAMES
            or isinstance(child.func, ast.Attribute)
            and child.func.attr in _DML_CALL_NAMES
        )
        for child in ast.walk(node)
    )


def _contains_mapped_annotation(annotation: object) -> bool:
    if isinstance(annotation, type):
        try:
            if issubclass(annotation, Base):
                return True
        except TypeError:
            pass
    return any(
        _contains_mapped_annotation(argument) for argument in get_args(annotation)
    )


def _mapped_state_names(
    function: object,
    tree: ast.AST,
    session_names: set[str],
) -> set[str]:
    hints = get_type_hints(function)
    tainted = {
        name
        for name, parameter in inspect.signature(function).parameters.items()
        if _contains_mapped_annotation(hints.get(name, parameter.annotation))
    }
    changed = True
    while changed:
        changed = False
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                value = node.value
                if not _contains_name(value, session_names | tainted):
                    continue
                for target in targets:
                    if isinstance(target, ast.Name) and target.id not in tainted:
                        tainted.add(target.id)
                        changed = True
            elif isinstance(node, ast.For) and _contains_name(node.iter, tainted):
                if isinstance(node.target, ast.Name) and node.target.id not in tainted:
                    tainted.add(node.target.id)
                    changed = True
    return tainted


def _service_call_target(function: object, call: ast.Call) -> str | None:
    target = None
    if isinstance(call.func, ast.Name):
        target = function.__globals__.get(call.func.id)
    elif isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name):
        owner = function.__globals__.get(call.func.value.id)
        target = getattr(owner, call.func.attr, None)
    if not inspect.isfunction(target):
        return None
    module_name = getattr(target, "__module__", "")
    if not module_name.startswith("app.services."):
        return None
    return f"{module_name}.{target.__name__}"


def _service_write_graph() -> tuple[set[str], dict[str, set[str]]]:
    """Build conservative persistent-write seeds and service call edges."""
    direct_writes: set[str] = set()
    calls: dict[str, set[str]] = {}
    for module_info in pkgutil.iter_modules(services.__path__):
        module_name = f"{services.__name__}.{module_info.name}"
        module = importlib.import_module(module_name)
        for _, function in inspect.getmembers(module, inspect.isfunction):
            if function.__module__ != module_name:
                continue
            qualified_name = f"{module_name}.{function.__name__}"
            tree = ast.parse(textwrap.dedent(inspect.getsource(function)))
            session_names = {
                name
                for name, parameter in inspect.signature(function).parameters.items()
                if name in {"connection", "db", "session"}
                or any(
                    type_name in str(parameter.annotation)
                    for type_name in {"Connection", "Session"}
                )
            }
            mapped_state_names = _mapped_state_names(function, tree, session_names)
            function_calls: set[str] = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    target = _service_call_target(function, node)
                    if target is not None:
                        function_calls.add(target)
                    if (
                        isinstance(node.func, ast.Name)
                        and node.func.id == "setattr"
                        and node.args
                        and _contains_name(node.args[0], mapped_state_names)
                    ):
                        direct_writes.add(qualified_name)
                    if not isinstance(node.func, ast.Attribute):
                        continue
                    receiver = node.func.value
                    method = node.func.attr
                    if method in _DB_WRITE_METHODS and _contains_name(
                        receiver, session_names
                    ):
                        direct_writes.add(qualified_name)
                    if method in {"delete", "update"} and _contains_name(
                        receiver, session_names
                    ):
                        direct_writes.add(qualified_name)
                    if (
                        method == "execute"
                        and _contains_name(receiver, session_names)
                        and any(_contains_dml_call(argument) for argument in node.args)
                    ):
                        direct_writes.add(qualified_name)
                    if (
                        method == "exec_driver_sql"
                        and _contains_name(receiver, session_names)
                        and node.args
                        and isinstance(node.args[0], ast.Constant)
                        and isinstance(node.args[0].value, str)
                        and node.args[0].value.lstrip().upper().startswith(
                            ("ALTER ", "CREATE ", "DELETE ", "DROP ", "INSERT ", "UPDATE ")
                        )
                    ):
                        direct_writes.add(qualified_name)
                    if method in {
                        "delete_cookie",
                        "mkdir",
                        "set_cookie",
                        "unlink",
                        "write_bytes",
                        "write_text",
                    }:
                        direct_writes.add(qualified_name)
                    if (
                        method in {"listen", "remove"}
                        and isinstance(receiver, ast.Name)
                        and receiver.id == "event"
                    ):
                        direct_writes.add(qualified_name)
                if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                    if any(
                        isinstance(target, ast.Attribute)
                        and _contains_name(target.value, mapped_state_names)
                        for target in targets
                    ):
                        direct_writes.add(qualified_name)
            calls[qualified_name] = function_calls
    return direct_writes, calls


def _write_reachable_services() -> set[str]:
    reachable, calls = _service_write_graph()
    changed = True
    while changed:
        changed = False
        for qualified_name, targets in calls.items():
            if qualified_name not in reachable and targets & reachable:
                reachable.add(qualified_name)
                changed = True
    return reachable


def test_service_actor_discovery_rejects_optional_and_untyped_actor_bypasses() -> None:
    def optional_employee(subject: Employee | None = None) -> None:
        del subject

    def untyped_actor(*, requester=None) -> None:
        del requester

    assert _actor_parameter_names(optional_employee) == ["subject"]
    assert _actor_parameter_names(untyped_actor) == ["requester"]


def _discovered_service_actor_consumers() -> dict[str, str]:
    manifest = _manifest_module()
    read_only_exceptions = getattr(
        manifest,
        "SERVICE_ACTOR_LIKE_READ_ONLY_EXCEPTIONS",
        frozenset(),
    )
    return {
        qualified_name: actor_parameter
        for qualified_name, actor_parameter in _discovered_service_actor_candidates().items()
        if qualified_name not in read_only_exceptions
    }


def test_service_actor_consumer_manifest_matches_discovery_bidirectionally() -> None:
    manifest = _manifest_module()
    declared = manifest.SERVICE_ACTOR_CONSUMERS
    discovered = _discovered_service_actor_consumers()

    assert declared == discovered


def test_every_public_service_surface_has_one_exact_security_class() -> None:
    manifest = _manifest_module()
    reexport_targets = set(_discovered_public_service_reexports().values())
    actual = set(_discovered_public_service_functions()) | reexport_targets
    actor_consumers = set(manifest.SERVICE_ACTOR_CONSUMERS)
    read_only = set(manifest.SERVICE_READ_ONLY_EXPORTS)
    infrastructure = set(manifest.SERVICE_INFRASTRUCTURE_MUTATION_REASONS)

    assert not (actor_consumers & read_only)
    assert not (actor_consumers & infrastructure)
    assert not (read_only & infrastructure)
    assert actual == actor_consumers | read_only | infrastructure
    assert all(manifest.SERVICE_INFRASTRUCTURE_MUTATION_REASONS.values())


def test_public_service_reexports_target_one_exact_security_class() -> None:
    manifest = _manifest_module()
    classes = (
        set(manifest.SERVICE_ACTOR_CONSUMERS),
        set(manifest.SERVICE_READ_ONLY_EXPORTS),
        set(manifest.SERVICE_INFRASTRUCTURE_MUTATION_REASONS),
    )

    for alias_name, target_name in _discovered_public_service_reexports().items():
        assert sum(target_name in category for category in classes) == 1, (
            f"{alias_name} re-exports unclassified {target_name}"
        )


def test_read_only_service_surfaces_have_no_persistent_write_reachability() -> None:
    manifest = _manifest_module()
    reachable = _write_reachable_services()

    assert not (set(manifest.SERVICE_READ_ONLY_EXPORTS) & reachable)


@pytest.mark.parametrize(
    ("module_name", "function_name"),
    [
        ("app.services.inv_effect", "apply_effect_reverse"),
        ("app.services.bom_stock_policy", "issue_bom_auto_token"),
        ("app.services.io_persist", "normalize_batch_bom_stock_exempt"),
        ("app.services.io_persist", "sync_batch_from_stock_request"),
        ("app.services.io_persist", "sync_batch_from_stock_requests"),
        ("app.services.item_display_order", "apply_default_item_display_order"),
        ("app.services.item_display_order", "insert_item_at_process_end"),
        ("app.services.notifications", "notify_handover_arrived"),
        ("app.services.notifications", "notify_request_arrived"),
        ("app.services.notifications", "notify_request_decided"),
        ("app.services.reorder", "reorder_by_display_order"),
        ("app.services.warehouse_map", "deplete_boxes_by_order"),
        ("app.services.warehouse_map", "apply_warehouse_ledger_delta"),
        ("app.services.warehouse_map", "lock_warehouse_ledger"),
        ("app.services.warehouse_map", "replace_box_items"),
        ("app.services.warehouse_map", "replace_zone_items"),
        ("app.services.warehouse_map", "set_box_tracking_enabled"),
    ],
)
def test_low_level_business_mutators_are_not_public_service_exports(
    module_name: str,
    function_name: str,
) -> None:
    assert not hasattr(importlib.import_module(module_name), function_name)


def test_actor_like_read_only_service_exceptions_are_exact() -> None:
    manifest = _manifest_module()
    exceptions = getattr(
        manifest,
        "SERVICE_ACTOR_LIKE_READ_ONLY_EXCEPTIONS",
        frozenset(),
    )
    candidates = _discovered_service_actor_candidates()

    assert exceptions <= set(candidates)


def test_every_manifested_service_actor_is_a_required_call_argument() -> None:
    manifest = _manifest_module()
    for qualified_name, actor_parameter in manifest.SERVICE_ACTOR_CONSUMERS.items():
        module_name, function_name = qualified_name.rsplit(".", 1)
        function = getattr(importlib.import_module(module_name), function_name)
        signature = inspect.signature(function)
        parameter = signature.parameters[actor_parameter]
        assert parameter.default is inspect.Parameter.empty

        kwargs = {
            name: object()
            for name, candidate in signature.parameters.items()
            if name != actor_parameter
            and candidate.default is inspect.Parameter.empty
            and candidate.kind
            in {inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY}
        }
        with pytest.raises(TypeError):
            signature.bind(**kwargs)


def test_shipping_service_public_surfaces_are_fully_classified() -> None:
    """출하 core의 새 공개 함수가 actor manifest를 우회하지 못하게 한다."""
    manifest = _manifest_module()
    shipping_module = importlib.import_module("app.services.shipping")
    shipping_actions_module = importlib.import_module("app.services.shipping_actions")

    core_public = {
        f"{shipping_module.__name__}.{function_name}"
        for function_name, function in inspect.getmembers(
            shipping_module, inspect.isfunction
        )
        if not function_name.startswith("_")
        and function.__module__ == shipping_module.__name__
    }
    action_public = {
        f"{shipping_actions_module.__name__}.{function_name}"
        for function_name, function in inspect.getmembers(
            shipping_actions_module, inspect.isfunction
        )
        if not function_name.startswith("_")
        and function.__module__ == shipping_actions_module.__name__
    }
    declared_actions = {
        qualified_name
        for qualified_name in manifest.SERVICE_ACTOR_CONSUMERS
        if qualified_name.startswith(f"{shipping_actions_module.__name__}.")
    }

    assert core_public == manifest.SHIPPING_READ_ONLY_SERVICE_EXPORTS
    assert action_public == declared_actions


def test_inventory_service_public_surfaces_are_fully_classified() -> None:
    manifest = _manifest_module()
    inventory_module = importlib.import_module("app.services.inventory")
    prefix = f"{inventory_module.__name__}."
    public_exports = {
        f"{inventory_module.__name__}.{function_name}"
        for function_name, function in inspect.getmembers(
            inventory_module,
            inspect.isfunction,
        )
        if not function_name.startswith("_")
        and function.__module__.startswith("app.services.")
    }
    actor_consumers = {
        qualified_name
        for qualified_name in manifest.SERVICE_ACTOR_CONSUMERS
        if qualified_name.startswith(prefix)
    }
    read_only_exports = getattr(
        manifest,
        "INVENTORY_READ_ONLY_SERVICE_EXPORTS",
        frozenset(),
    )
    assert not (actor_consumers & read_only_exports)
    assert not hasattr(manifest, "INVENTORY_ACTORLESS_MUTATION_PRIMITIVES")
    assert public_exports == actor_consumers | read_only_exports


def test_stock_reservation_service_public_surfaces_are_fully_classified() -> None:
    manifest = _manifest_module()
    reservation_module = importlib.import_module("app.services.sr_reservation")
    prefix = f"{reservation_module.__name__}."
    public_exports = {
        f"{reservation_module.__name__}.{function_name}"
        for function_name, function in inspect.getmembers(
            reservation_module,
            inspect.isfunction,
        )
        if not function_name.startswith("_")
        and function.__module__ == reservation_module.__name__
    }
    actor_consumers = {
        qualified_name
        for qualified_name in manifest.SERVICE_ACTOR_CONSUMERS
        if qualified_name.startswith(prefix)
    }
    read_only_exports = getattr(
        manifest,
        "STOCK_RESERVATION_READ_ONLY_SERVICE_EXPORTS",
        frozenset(),
    )
    assert not (actor_consumers & read_only_exports)
    assert not hasattr(manifest, "STOCK_RESERVATION_ACTORLESS_MUTATION_PRIMITIVES")
    assert public_exports == actor_consumers | read_only_exports


def test_stock_request_mutation_surfaces_are_exact_actor_consumers() -> None:
    manifest = _manifest_module()
    module_names = (
        "app.services.sr_approval",
        "app.services.sr_execution",
    )
    public_mutations = {
        f"{module_name}.{function_name}"
        for module_name in module_names
        for function_name, function in inspect.getmembers(
            importlib.import_module(module_name),
            inspect.isfunction,
        )
        if not function_name.startswith("_")
    }
    declared = {
        qualified_name
        for qualified_name in manifest.SERVICE_ACTOR_CONSUMERS
        if any(qualified_name.startswith(f"{module_name}.") for module_name in module_names)
    }

    assert public_mutations == declared


def test_release_reservation_requires_keyword_only_employee_actor() -> None:
    module = importlib.import_module("app.services.sr_execution")
    function = module.release_reservation
    signature = inspect.signature(function)

    assert signature.parameters["actor"].kind is inspect.Parameter.KEYWORD_ONLY
    with pytest.raises(TypeError):
        signature.bind(object(), object())
    with pytest.raises(TypeError, match="actor must be an Employee"):
        function(object(), object(), actor=object())
