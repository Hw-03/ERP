"""Exercise real Windows install copies and rollback without running either server."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest

from test_employee_frontend_release import _fake_toolchain, _module, _prepare, _write

RELATIVE = ".next-prod/build/chunks/pool_entry-[turbopack-node]_transforms_postcss_ts_0p7u0fa._.js"


@pytest.mark.skipif(os.name != "nt", reason="Native Windows CopyFile2 path contract")
@pytest.mark.parametrize("destination_shape", ["qa-long", "operational-short"])
def test_real_long_frontend_copy_keeps_bytes_metadata_and_rollback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, destination_shape: str) -> None:
    """Build metadata is synthetic; install copies and rollback use the real functions."""
    module = _module()
    source, node, prepared, _ = _prepare(module, tmp_path / "prepared-inputs", monkeypatch)
    source_file = module._copy_io_path(prepared / "frontend" / RELATIVE)
    _write(source_file, "synthetic compiled JavaScript bytes\n")
    os.utime(source_file, (1700000000, 1700000000))
    receipt = json.loads((prepared / "receipt.json").read_text())
    receipt["artifacts"] = module.files(prepared / "frontend")
    module._json(prepared / "receipt.json", receipt)
    employee = (tmp_path / "employee" if destination_shape == "qa-long"
                else tmp_path.parent / ("e-" + uuid4().hex[:8]))
    _write(employee / "frontend/.next-prod/BUILD_ID", "old build")
    _write(employee / "frontend/package.json", "old package")
    _write(employee / "scripts/runtime.ps1", "old runtime")
    old_node = _fake_toolchain(employee / "_attic/runtime/old")
    config = employee / "_attic/runtime/frontend-node-path.txt"
    _write(config, str(old_node))
    before_frontend = module.files(employee / "frontend")
    before_config = config.read_bytes()
    destination = employee / "_attic/runtime/frontend-releases" / ("a" * 32) / "incoming-frontend" / RELATIVE
    assert len(str(prepared / "frontend" / RELATIVE)) > 260
    assert (len(str(destination)) > 260) == (destination_shape == "qa-long")
    record = module.install(prepared, source, node, employee)
    installed = module._copy_io_path(employee / "frontend" / RELATIVE)
    assert installed.read_bytes() == source_file.read_bytes()
    assert installed.stat().st_mtime_ns == source_file.stat().st_mtime_ns
    assert installed.stat().st_mode == source_file.stat().st_mode
    assert module.files(prepared / "frontend") == receipt["artifacts"]
    module.rollback(record, employee)
    assert module.files(employee / "frontend") == before_frontend
    assert config.read_bytes() == before_config
    assert json.loads(record.read_text())["phase"] == "ROLLED_BACK"


def test_install_keeps_descendant_boundary(tmp_path: Path) -> None:
    module = _module()
    employee = tmp_path / "employee"
    employee.mkdir()
    with pytest.raises(module.ReleaseError, match="outside"):
        module._inside(employee / "../outside", employee)


@pytest.mark.skipif(os.name != "nt", reason="Native Windows CopyFile2 branch contracts")
@pytest.mark.parametrize("branch", ["node", "logs", "_archive"])
def test_real_long_remaining_copytree_branches_keep_metadata_and_rollback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, branch: str) -> None:
    """Each other copy branch must preserve actual bytes and metadata past MAX_PATH."""
    module = _module()
    source, node, prepared, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "qa-fixture" / "employee"
    _write(employee / "frontend/package.json", "old package")
    old_node = _fake_toolchain(employee / "_attic/runtime/old")
    config = employee / "_attic/runtime/frontend-node-path.txt"
    _write(config, str(old_node))
    if branch == "node":
        relative = "node_modules/npm/node_modules/validate-npm-package-license/node_modules/spdx-expression-parse/package.json"
        source_file = module._copy_io_path(node.parent / relative)
    else:
        relative = branch + "/" + "/".join(["retained-operational-metadata"] * 3) + "/history.log"
        source_file = module._copy_io_path(employee / "frontend" / relative)
    _write(source_file, "synthetic retained bytes\n")
    expected_bytes = source_file.read_bytes()
    os.utime(source_file, (1700000000, 1700000000))
    metadata = (source_file.stat().st_mtime_ns, source_file.stat().st_mode)
    receipt = json.loads((prepared / "receipt.json").read_text())
    if branch == "node":
        receipt["toolchain"] = module._toolchain(node)
        module._json(prepared / "receipt.json", receipt)
        destination = employee / "_attic/runtime/tools" / ("node-" + receipt["toolchain"]["version"] + "-" + module._digest(receipt["toolchain"])[:12]) / relative
    else:
        destination = employee / "_attic/runtime/frontend-releases" / ("a" * 32) / "incoming-frontend" / relative
    assert len(str(destination)) > 260
    before_frontend = module.files(employee / "frontend")
    before_node = module._previous_node(employee)
    record = module.install(prepared, source, node, employee)
    if branch == "node":
        installed = module._copy_io_path(Path(config.read_text()).parent / relative)
    else:
        installed = module._copy_io_path(employee / "frontend" / relative)
    assert installed.read_bytes() == expected_bytes
    assert (installed.stat().st_mtime_ns, installed.stat().st_mode) == metadata
    module.rollback(record, employee)
    assert module.files(employee / "frontend") == before_frontend
    assert module._previous_node(employee) == before_node
    assert config.read_text() == str(old_node)


@pytest.mark.skipif(os.name != "nt", reason="Native Windows junction contract")
@pytest.mark.parametrize("linked_location", ["employee", "prepared-child"])
def test_install_rejects_real_junction_before_employee_mutation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, linked_location: str) -> None:
    module = _module()
    source, node, prepared, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    outside = tmp_path / "outside"
    outside.mkdir()
    _write(outside / "sentinel.txt", "must remain untouched")
    if linked_location == "employee":
        link = employee
    else:
        _write(employee / "frontend/package.json", "old package")
        link = prepared / "frontend/linked-directory"
    result = subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(outside)], capture_output=True)
    assert result.returncode == 0, result.stderr
    with pytest.raises(module.ReleaseError, match="Linked deployment path"):
        module.install(prepared, source, node, employee)
    assert module.files(outside) == {"sentinel.txt": module.hashlib.sha256(b"must remain untouched").hexdigest()}
    assert not (employee / "_attic").exists()
