#!/usr/bin/env python3
"""Synchronize August department stock from confirmed Excel current-stock cells."""

from __future__ import annotations

import argparse
import base64
from collections import defaultdict
from dataclasses import asdict, dataclass, replace
from datetime import datetime
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from typing import Any, Callable
from uuid import UUID

from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session, sessionmaker


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
TARGET_DEPARTMENTS = ("튜브", "고압", "진공", "튜닝", "조립", "출하")
PROCESS_DEPARTMENTS = {
    "T": "튜브",
    "H": "고압",
    "V": "진공",
    "N": "튜닝",
    "A": "조립",
    "P": "출하",
}

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.models import (  # noqa: E402
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    ProcessType,
)


class DepartmentSyncError(ValueError):
    """Raised when the department baseline cannot be applied safely."""


@dataclass(frozen=True)
class FileSpec:
    """Describe one source workbook without relying on cached formula values."""

    source: str
    filename: str
    sheet_name: str
    max_row: int
    original_name_col: str
    quantity_col: str
    mes_name_col: str
    mes_code_col: str
    confirmation_col: str
    expected_headers: tuple[tuple[str, str], ...]


FILE_SPECS = (
    FileSpec(
        source="high_vacuum_tuning",
        filename="2026.08_생산부 자재_고압,진공,튜닝파트.xlsx",
        sheet_name="고압",
        max_row=206,
        original_name_col="E",
        quantity_col="J",
        mes_name_col="K",
        mes_code_col="M",
        confirmation_col="N",
        expected_headers=(("E2", "품목"), ("J2", "현재고"), ("K2", "MES 품목명"), ("M2", "MES 코드"), ("N2", "담당자 확인")),
    ),
    FileSpec(
        source="assembly_shipping",
        filename="2026.08_생산부 자재_조립,출하파트.xlsx",
        sheet_name="조립 자재",
        max_row=559,
        original_name_col="D",
        quantity_col="I",
        mes_name_col="J",
        mes_code_col="L",
        confirmation_col="M",
        expected_headers=(("D2", "품 목"), ("I2", "현재고"), ("J2", "MES 품목명"), ("L2", "MES 코드"), ("M2", "담당자 확인")),
    ),
    FileSpec(
        source="tube",
        filename="2026.08_생산부 자재_튜브 파트.xlsx",
        sheet_name="튜브",
        max_row=24,
        original_name_col="C",
        quantity_col="H",
        mes_name_col="I",
        mes_code_col="K",
        confirmation_col="L",
        expected_headers=(("C2", "품목"), ("H2", "현재고"), ("I2", "MES 품목명"), ("K2", "MES 코드"), ("L2", "담당자 확인")),
    ),
    FileSpec(
        source="finished",
        filename="2026.08_출하_완제품.xlsx",
        sheet_name="완제품",
        max_row=54,
        original_name_col="B",
        quantity_col="L",
        mes_name_col="V",
        mes_code_col="X",
        confirmation_col="Y",
        expected_headers=(("B2", "품 목"), ("L2", "총 합"), ("V2", "MES 품목명"), ("X2", "MES 코드"), ("Y2", "담당자 확인")),
    ),
)


@dataclass(frozen=True)
class SourceRow:
    """One Excel inventory row read after Microsoft Excel calculation."""

    source: str
    sheet_name: str
    row_number: int
    department: str | None
    original_name: str
    mes_name: str
    mes_code: str
    confirmation: str
    quantity: object
    quantity_text: str = ""


@dataclass(frozen=True)
class DepartmentSnapshot:
    """Immutable source rows and hashes used by one dry-run or apply."""

    rows: tuple[SourceRow, ...]
    source_hashes: dict[str, str]


@dataclass(frozen=True)
class EmployeeItem:
    """Current active employee-server item fields needed by the sync."""

    item_id: str
    mes_code: str
    item_name: str
    sort_order: int | None
    unit: str
    legacy_part: str | None
    legacy_item_type: str | None
    supplier: str | None
    min_stock: int | None
    model_symbol: str
    process_type_code: str
    serial_no: int
    bom_completed_at: datetime | None
    sales_review_required: bool


@dataclass(frozen=True)
class Resolution:
    """Resolved targets plus conservative protection keys for partial sync."""

    applied_targets: dict[tuple[str, str], int]
    applied_items: dict[str, EmployeeItem]
    protected_keys: frozenset[tuple[str, str]]
    source_quantity: int
    confirmed_rows: int
    unconfirmed_rows: int
    resolved_rows: int
    unresolved_rows: tuple[dict[str, Any], ...]
    duplicate_groups: int
    protected_groups: int
    name_mismatch_rows: int


@dataclass(frozen=True)
class SyncSummary:
    """Dry-run or applied department synchronization result."""

    applied: bool
    source_rows: int
    source_quantity: int
    confirmed_rows: int
    unconfirmed_rows: int
    resolved_rows: int
    unresolved_rows: int
    duplicate_groups: int
    applied_groups: int
    protected_groups: int
    name_mismatch_rows: int
    master_items_added: int
    master_items_updated: int
    changed_locations: int
    absent_locations_zeroed: int
    absent_quantity_zeroed: int
    production_quantity_before: int
    production_quantity_after: int
    department_totals_before: dict[str, int]
    department_totals_after: dict[str, int]
    unresolved_details: tuple[dict[str, Any], ...]
    source_hashes: dict[str, str]


_ITEM_FIELDS = (
    "item_name",
    "sort_order",
    "unit",
    "legacy_part",
    "legacy_item_type",
    "supplier",
    "min_stock",
    "model_symbol",
    "process_type_code",
    "serial_no",
    "bom_completed_at",
    "sales_review_required",
)
_EXISTING_ITEM_FIELDS = ("item_name", "model_symbol", "process_type_code", "serial_no")


_EXCEL_EXTRACTOR = r"""
$ErrorActionPreference = 'Stop'
$manifestText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:MES_EXCEL_MANIFEST))
$manifest = $manifestText | ConvertFrom-Json
$results = New-Object System.Collections.Generic.List[object]
$excel = $null
$workbooks = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false
    $excel.AutomationSecurity = 3
    $workbooks = $excel.Workbooks
    foreach ($entry in @($manifest)) {
        $workbook = $null
        $sheet = $null
        try {
            $entryPath = [string]$entry.path
            if (-not (Test-Path -LiteralPath $entryPath)) { throw "Copied workbook not found: $entryPath" }
            try {
                $workbook = $workbooks.Open($entryPath, 0, $true)
            }
            catch {
                throw "Excel open failed: source=$($entry.source) path=$entryPath length=$($entryPath.Length) error=$($_.Exception.Message)"
            }
            $sheet = $workbook.Worksheets.Item([string]$entry.sheet_name)
            $sheet.Calculate()
            $headers = [ordered]@{}
            foreach ($header in @($entry.headers)) {
                $headers[[string]$header.cell] = $sheet.Range([string]$header.cell).Value2
            }
            $rows = New-Object System.Collections.Generic.List[object]
            for ($row = 3; $row -le [int]$entry.max_row; $row++) {
                $original = $sheet.Range("$($entry.original_name_col)$row").Value2
                $mesName = $sheet.Range("$($entry.mes_name_col)$row").Value2
                $mesCode = $sheet.Range("$($entry.mes_code_col)$row").Value2
                if ([string]::IsNullOrWhiteSpace([string]$original) -and
                    [string]::IsNullOrWhiteSpace([string]$mesName) -and
                    [string]::IsNullOrWhiteSpace([string]$mesCode)) { continue }
                $quantityCell = $sheet.Range("$($entry.quantity_col)$row")
                $rows.Add([ordered]@{
                    row_number = $row
                    original_name = $original
                    mes_name = $mesName
                    mes_code = $mesCode
                    confirmation = $sheet.Range("$($entry.confirmation_col)$row").Value2
                    quantity = $quantityCell.Value2
                    quantity_text = $quantityCell.Text
                })
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($quantityCell)
            }
            $results.Add([ordered]@{
                source = [string]$entry.source
                sheet_name = [string]$sheet.Name
                headers = $headers
                rows = $rows
            })
        }
        finally {
            if ($workbook) { $workbook.Close($false) }
            if ($sheet) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sheet) }
            if ($workbook) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($workbook) }
        }
    }
}
finally {
    if ($workbooks) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($workbooks) }
    if ($excel) { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
$json = ConvertTo-Json -InputObject $results -Depth 8 -Compress
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
"""


def _text(value: object) -> str:
    """Return trimmed text while treating Excel blanks as empty strings."""
    return "" if value is None else str(value).strip()


def _normalized_name(value: object) -> str:
    """Normalize only whitespace and case for conservative exact-name matching."""
    return re.sub(r"\s+", " ", _text(value)).casefold()


def _hash_file(path: Path) -> str:
    """Return a streaming SHA-256 hash without changing file metadata."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _parse_quantity(value: object, row: SourceRow) -> int:
    """Accept only calculated non-negative integer current-stock values."""
    if row.quantity_text.strip().startswith("#") or value in (None, ""):
        raise DepartmentSyncError(
            f"{row.source} row {row.row_number}: 현재고 계산값이 비어 있거나 오류입니다"
        )
    try:
        quantity = Decimal(str(value).replace(",", "").strip())
    except InvalidOperation as exc:
        raise DepartmentSyncError(
            f"{row.source} row {row.row_number}: 현재고가 숫자가 아닙니다: {value!r}"
        ) from exc
    if quantity < 0 or quantity != quantity.to_integral_value():
        raise DepartmentSyncError(
            f"{row.source} row {row.row_number}: 현재고는 0 이상의 정수여야 합니다"
        )
    return int(quantity)


def _normalize_item_id(value: object) -> str:
    """Return the canonical 32-character UUID used by SQLite UUIDString."""
    try:
        return UUID(str(value)).hex
    except (TypeError, ValueError, AttributeError) as exc:
        raise DepartmentSyncError(f"invalid item_id: {value!r}") from exc


def _optional_datetime(value: object) -> datetime | None:
    """Parse employee DB nullable ISO timestamps."""
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _run_excel_extractor(manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Run isolated Microsoft Excel COM calculation through Windows PowerShell."""
    encoded_command = base64.b64encode(_EXCEL_EXTRACTOR.encode("utf-16le")).decode("ascii")
    manifest_json = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
    environment = os.environ.copy()
    environment["MES_EXCEL_MANIFEST"] = base64.b64encode(manifest_json).decode("ascii")
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-EncodedCommand",
                encoded_command,
            ],
            env=environment,
            capture_output=True,
            check=False,
            timeout=600,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise DepartmentSyncError(f"Microsoft Excel 계산 실행 실패: {exc}") from exc
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise DepartmentSyncError(f"Microsoft Excel 계산 실패: {stderr}")
    output_lines = [line.strip() for line in result.stdout.decode("ascii", errors="ignore").splitlines() if line.strip()]
    if not output_lines:
        raise DepartmentSyncError("Microsoft Excel 계산 결과가 비어 있습니다")
    try:
        payload = base64.b64decode(output_lines[-1])
        decoded = json.loads(payload.decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise DepartmentSyncError("Microsoft Excel 계산 결과를 해석할 수 없습니다") from exc
    return list(decoded)


def extract_source_rows(source_dir: Path) -> DepartmentSnapshot:
    """Copy the four NAS files, calculate copies in Excel, and return current-stock rows."""
    source_dir = source_dir.resolve()
    if not source_dir.is_dir():
        raise DepartmentSyncError(f"source directory not found: {source_dir}")
    locks = sorted(path.name for path in source_dir.glob("~$*.xlsx"))
    if locks:
        raise DepartmentSyncError(f"Excel 파일이 열려 있습니다: {', '.join(locks)}")
    paths = {spec.filename: source_dir / spec.filename for spec in FILE_SPECS}
    missing = [name for name, path in paths.items() if not path.is_file()]
    if missing:
        raise DepartmentSyncError(f"source workbook not found: {', '.join(missing)}")
    hashes_before = {name: _hash_file(path) for name, path in paths.items()}
    with tempfile.TemporaryDirectory(prefix="mes-department-sync-") as temp_name:
        temp_dir = Path(temp_name)
        manifest: list[dict[str, Any]] = []
        for index, spec in enumerate(FILE_SPECS, start=1):
            copied = temp_dir / f"{index:02d}.xlsx"
            shutil.copy2(paths[spec.filename], copied)
            manifest.append(
                {
                    "source": spec.source,
                    "path": str(copied),
                    "sheet_name": spec.sheet_name,
                    "max_row": spec.max_row,
                    "original_name_col": spec.original_name_col,
                    "quantity_col": spec.quantity_col,
                    "mes_name_col": spec.mes_name_col,
                    "mes_code_col": spec.mes_code_col,
                    "confirmation_col": spec.confirmation_col,
                    "headers": [
                        {"cell": cell, "expected": expected}
                        for cell, expected in spec.expected_headers
                    ],
                }
            )
        extracted = _run_excel_extractor(manifest)
    hashes_after = {name: _hash_file(path) for name, path in paths.items()}
    if hashes_after != hashes_before:
        raise DepartmentSyncError("NAS source workbook changed during extraction")

    specs_by_source = {spec.source: spec for spec in FILE_SPECS}
    rows: list[SourceRow] = []
    seen_sources: set[str] = set()
    for workbook in extracted:
        source = _text(workbook.get("source"))
        spec = specs_by_source.get(source)
        if spec is None:
            raise DepartmentSyncError(f"unexpected extracted workbook: {source}")
        seen_sources.add(source)
        if _text(workbook.get("sheet_name")) != spec.sheet_name:
            raise DepartmentSyncError(f"worksheet mismatch for {spec.filename}")
        headers = workbook.get("headers") or {}
        for cell, expected in spec.expected_headers:
            actual = _text(headers.get(cell))
            if actual != expected:
                raise DepartmentSyncError(
                    f"{spec.filename}: expected header {expected!r} at {cell}, found {actual!r}"
                )
        for raw in workbook.get("rows") or []:
            rows.append(
                SourceRow(
                    source=source,
                    sheet_name=spec.sheet_name,
                    row_number=int(raw["row_number"]),
                    department=None,
                    original_name=_text(raw.get("original_name")),
                    mes_name=_text(raw.get("mes_name")),
                    mes_code=_text(raw.get("mes_code")).upper(),
                    confirmation=_text(raw.get("confirmation")),
                    quantity=raw.get("quantity"),
                    quantity_text=_text(raw.get("quantity_text")),
                )
            )
    if seen_sources != set(specs_by_source):
        raise DepartmentSyncError("not all source workbooks were extracted")
    if not rows:
        raise DepartmentSyncError("source workbooks have no inventory rows")
    return DepartmentSnapshot(rows=tuple(rows), source_hashes=hashes_before)


def _load_employee_items(path: Path) -> list[EmployeeItem]:
    """Load a consistent active item master from a read-only SQLite database."""
    if not path.is_file():
        raise DepartmentSyncError(f"employee DB not found: {path}")
    uri = f"file:{path.resolve().as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON")
        records = connection.execute(
            """
            SELECT item_id, mes_code, item_name, sort_order, unit, legacy_part,
                   legacy_item_type, supplier, min_stock, model_symbol,
                   process_type_code, serial_no, bom_completed_at,
                   sales_review_required
            FROM items
            WHERE deleted_at IS NULL
            """
        ).fetchall()
    return [
        EmployeeItem(
            item_id=_normalize_item_id(record["item_id"]),
            mes_code=_text(record["mes_code"]).upper(),
            item_name=_text(record["item_name"]),
            sort_order=record["sort_order"],
            unit=_text(record["unit"]),
            legacy_part=record["legacy_part"],
            legacy_item_type=record["legacy_item_type"],
            supplier=record["supplier"],
            min_stock=record["min_stock"],
            model_symbol=_text(record["model_symbol"]),
            process_type_code=_text(record["process_type_code"]),
            serial_no=int(record["serial_no"]),
            bom_completed_at=_optional_datetime(record["bom_completed_at"]),
            sales_review_required=bool(record["sales_review_required"]),
        )
        for record in records
    ]


def _department_for_process(process_type_code: str) -> str | None:
    """Map the current MES process-code prefix to one physical production department."""
    code = _text(process_type_code).upper()
    return PROCESS_DEPARTMENTS.get(code[:1]) if code else None


def _resolve_rows(
    rows: tuple[SourceRow, ...],
    employee_items: list[EmployeeItem],
    dev_items: list[Item],
) -> Resolution:
    """Match rows to the current item master and protect every incomplete group."""
    employee_by_code = {item.mes_code: item for item in employee_items}
    employee_by_name: defaultdict[str, list[EmployeeItem]] = defaultdict(list)
    for item in employee_items:
        employee_by_name[_normalized_name(item.item_name)].append(item)
    dev_by_code: defaultdict[str, list[Item]] = defaultdict(list)
    dev_by_name: defaultdict[str, list[Item]] = defaultdict(list)
    for item in dev_items:
        dev_by_code[_text(item.mes_code).upper()].append(item)
        dev_by_name[_normalized_name(item.item_name)].append(item)

    grouped: defaultdict[tuple[str, str], list[tuple[SourceRow, int, EmployeeItem]]] = defaultdict(list)
    unresolved: list[dict[str, Any]] = []
    protected: set[tuple[str, str]] = set()
    confirmed_rows = 0
    resolved_rows = 0
    source_quantity = 0
    name_mismatches = 0
    for row in rows:
        confirmed = row.confirmation.strip().upper() == "O"
        confirmed_rows += int(confirmed)
        try:
            quantity = _parse_quantity(row.quantity, row)
        except DepartmentSyncError:
            if confirmed:
                raise
            quantity = 0
        source_quantity += quantity
        employee_item = employee_by_code.get(row.mes_code)
        method = "code" if employee_item is not None else ""
        if employee_item is None:
            mes_candidates = employee_by_name.get(_normalized_name(row.mes_name), []) if row.mes_name else []
            if len(mes_candidates) == 1:
                employee_item = mes_candidates[0]
                method = "mes_name"
        if employee_item is None:
            original_candidates = employee_by_name.get(_normalized_name(row.original_name), []) if row.original_name else []
            if len(original_candidates) == 1:
                employee_item = original_candidates[0]
                method = "original_name"
        if employee_item is not None:
            equivalent_dev_items = [
                candidate
                for candidate in dev_by_code.get(employee_item.mes_code, [])
                if candidate.deleted_at is None
                and _normalized_name(candidate.item_name) == _normalized_name(employee_item.item_name)
            ]
            if len(equivalent_dev_items) == 1:
                existing_item_id = _normalize_item_id(equivalent_dev_items[0].item_id)
                if existing_item_id != employee_item.item_id:
                    employee_item = replace(employee_item, item_id=existing_item_id)
        department = (
            _department_for_process(employee_item.process_type_code)
            if employee_item is not None
            else None
        )
        if employee_item is not None and department is not None:
            resolved_rows += 1
            if row.mes_name and _normalized_name(row.mes_name) != _normalized_name(employee_item.item_name):
                name_mismatches += 1
            grouped[(department, employee_item.item_id)].append((row, quantity, employee_item))
            continue

        detail = {
            "source": row.source,
            "sheet": row.sheet_name,
            "row": row.row_number,
            "mes_code": row.mes_code,
            "mes_name": row.mes_name,
            "original_name": row.original_name,
            "quantity": quantity,
            "confirmed": confirmed,
            "reason": "no unique active employee item" if employee_item is None else "unsupported process code",
            "match_method": method,
        }
        unresolved.append(detail)
        dev_candidates: dict[str, Item] = {}
        for candidate in dev_by_code.get(row.mes_code, []):
            dev_candidates[_normalize_item_id(candidate.item_id)] = candidate
        for value in (row.mes_name, row.original_name):
            if value:
                for candidate in dev_by_name.get(_normalized_name(value), []):
                    dev_candidates[_normalize_item_id(candidate.item_id)] = candidate
        for item_id, candidate in dev_candidates.items():
            candidate_department = _department_for_process(candidate.process_type_code)
            if candidate_department is not None:
                protected.add((candidate_department, item_id))

    applied_targets: dict[tuple[str, str], int] = {}
    applied_items: dict[str, EmployeeItem] = {}
    duplicate_groups = 0
    protected_groups = 0
    for key, group in grouped.items():
        duplicate_groups += int(len(group) > 1)
        if all(row.confirmation.strip().upper() == "O" for row, _, _ in group):
            applied_targets[key] = sum(quantity for _, quantity, _ in group)
            applied_items[key[1]] = group[0][2]
        else:
            protected.add(key)
            protected_groups += 1
    return Resolution(
        applied_targets=applied_targets,
        applied_items=applied_items,
        protected_keys=frozenset(protected),
        source_quantity=source_quantity,
        confirmed_rows=confirmed_rows,
        unconfirmed_rows=len(rows) - confirmed_rows,
        resolved_rows=resolved_rows,
        unresolved_rows=tuple(unresolved),
        duplicate_groups=duplicate_groups,
        protected_groups=protected_groups,
        name_mismatch_rows=name_mismatches,
    )


def _item_values(item: EmployeeItem) -> dict[str, Any]:
    """Return fields required to add a missing current employee item."""
    return {field: getattr(item, field) for field in _ITEM_FIELDS}


def _item_differs(item: Item, employee_item: EmployeeItem) -> bool:
    """Limit existing master updates to code-generating fields and the current name."""
    return any(
        getattr(item, field) != getattr(employee_item, field)
        for field in _EXISTING_ITEM_FIELDS
    )


def _validate_master_changes(
    db: Session,
    employee_items: dict[str, EmployeeItem],
) -> tuple[list[EmployeeItem], list[tuple[Item, EmployeeItem]]]:
    """Project related master changes and reject every MES-code collision."""
    dev_items = db.query(Item).all()
    by_id = {_normalize_item_id(item.item_id): item for item in dev_items}
    additions: list[EmployeeItem] = []
    updates: list[tuple[Item, EmployeeItem]] = []
    projected_codes = {
        _normalize_item_id(item.item_id): _text(item.mes_code).upper()
        for item in dev_items
    }
    for item_id, employee_item in employee_items.items():
        existing = by_id.get(item_id)
        projected_codes[item_id] = employee_item.mes_code
        if existing is None:
            additions.append(employee_item)
        elif _item_differs(existing, employee_item):
            updates.append((existing, employee_item))
    code_owners: dict[str, str] = {}
    for item_id, code in projected_codes.items():
        owner = code_owners.get(code)
        if owner is not None and owner != item_id:
            raise DepartmentSyncError(f"MES code collision: {code}")
        code_owners[code] = item_id
    required_process_types = {item.process_type_code for item in employee_items.values()}
    known_process_types = {
        code
        for (code,) in db.query(ProcessType.code).filter(ProcessType.code.in_(required_process_types))
    }
    missing = sorted(required_process_types - known_process_types)
    if missing:
        raise DepartmentSyncError(f"dev DB is missing process types: {', '.join(missing)}")
    return additions, updates


def _location_totals(db: Session, item_ids: set[str]) -> dict[str, int]:
    """Return all-status location totals for the affected item ids."""
    if not item_ids:
        return {}
    rows = (
        db.query(InventoryLocation.item_id, func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(InventoryLocation.item_id.in_([UUID(item_id) for item_id in item_ids]))
        .group_by(InventoryLocation.item_id)
    )
    return {_normalize_item_id(item_id): int(quantity) for item_id, quantity in rows}


def run_sync(
    db: Session,
    employee_db_path: Path,
    snapshot: DepartmentSnapshot,
    *,
    apply: bool = False,
) -> SyncSummary:
    """Validate and optionally apply one atomic six-department partial baseline."""
    employee_items = _load_employee_items(employee_db_path)
    dev_items = db.query(Item).all()
    resolution = _resolve_rows(snapshot.rows, employee_items, dev_items)
    additions, updates = _validate_master_changes(db, resolution.applied_items)
    locations = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            InventoryLocation.department.in_(TARGET_DEPARTMENTS),
        )
        .all()
    )
    current = {
        (location.department, _normalize_item_id(location.item_id)): int(location.quantity)
        for location in locations
    }
    projected = dict(current)
    for key, target in resolution.applied_targets.items():
        projected[key] = target
    absent_zeroed = 0
    absent_zeroed_quantity = 0
    for key, quantity in current.items():
        if key not in resolution.applied_targets and key not in resolution.protected_keys:
            projected[key] = 0
            if quantity:
                absent_zeroed += 1
                absent_zeroed_quantity += quantity
    changed_keys = {
        key
        for key in set(current) | set(projected)
        if current.get(key, 0) != projected.get(key, 0)
    }
    before_by_department = {
        department: sum(quantity for (dept, _), quantity in current.items() if dept == department)
        for department in TARGET_DEPARTMENTS
    }
    after_by_department = {
        department: sum(quantity for (dept, _), quantity in projected.items() if dept == department)
        for department in TARGET_DEPARTMENTS
    }
    summary = SyncSummary(
        applied=apply,
        source_rows=len(snapshot.rows),
        source_quantity=resolution.source_quantity,
        confirmed_rows=resolution.confirmed_rows,
        unconfirmed_rows=resolution.unconfirmed_rows,
        resolved_rows=resolution.resolved_rows,
        unresolved_rows=len(resolution.unresolved_rows),
        duplicate_groups=resolution.duplicate_groups,
        applied_groups=len(resolution.applied_targets),
        protected_groups=resolution.protected_groups + len(resolution.unresolved_rows),
        name_mismatch_rows=resolution.name_mismatch_rows,
        master_items_added=len(additions),
        master_items_updated=len(updates),
        changed_locations=len(changed_keys),
        absent_locations_zeroed=absent_zeroed,
        absent_quantity_zeroed=absent_zeroed_quantity,
        production_quantity_before=sum(current.values()),
        production_quantity_after=sum(projected.values()),
        department_totals_before=before_by_department,
        department_totals_after=after_by_department,
        unresolved_details=resolution.unresolved_rows,
        source_hashes=snapshot.source_hashes,
    )
    if not apply:
        return summary

    try:
        for item, employee_item in updates:
            for field in _EXISTING_ITEM_FIELDS:
                setattr(item, field, getattr(employee_item, field))
        for employee_item in additions:
            db.add(Item(item_id=UUID(employee_item.item_id), **_item_values(employee_item)))
        db.flush()

        location_by_key = {
            (location.department, _normalize_item_id(location.item_id)): location
            for location in db.query(InventoryLocation).filter(
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
                InventoryLocation.department.in_(TARGET_DEPARTMENTS),
            )
        }
        affected_item_ids: set[str] = set()
        for key in changed_keys:
            department, item_id = key
            target = projected.get(key, 0)
            location = location_by_key.get(key)
            if location is None:
                if target == 0:
                    continue
                location = InventoryLocation(
                    item_id=UUID(item_id),
                    department=department,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=target,
                )
                db.add(location)
            else:
                location.quantity = target
            affected_item_ids.add(item_id)
        affected_item_ids.update(resolution.applied_items)
        db.flush()

        totals = _location_totals(db, affected_item_ids)
        inventories = {
            _normalize_item_id(inventory.item_id): inventory
            for inventory in db.query(Inventory).filter(
                Inventory.item_id.in_([UUID(item_id) for item_id in affected_item_ids])
            )
        }
        for item_id in affected_item_ids:
            inventory = inventories.get(item_id)
            if inventory is None:
                inventory = Inventory(
                    item_id=UUID(item_id),
                    quantity=0,
                    warehouse_qty=0,
                    pending_quantity=0,
                )
                db.add(inventory)
            inventory.quantity = int(inventory.warehouse_qty or 0) + totals.get(item_id, 0)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return summary


def _copy_read_only_sqlite(source: Path, target: Path) -> None:
    """Create a consistent local employee-master snapshot through SQLite backup."""
    uri = f"file:{source.resolve().as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as source_connection, sqlite3.connect(target) as target_connection:
        source_connection.execute("PRAGMA query_only=ON")
        source_connection.backup(target_connection)


def execute_sync(
    *,
    source_dir: Path,
    dev_db_path: Path,
    employee_db_path: Path,
    apply: bool,
    confirm: str | None,
    backup_fn: Callable[[str], object] | None = None,
    extractor: Callable[[Path], DepartmentSnapshot] = extract_source_rows,
) -> SyncSummary:
    """Run dry-run or backed-up apply against one explicit development DB."""
    if apply and confirm != "SYNC-DEPARTMENT-INVENTORY":
        raise DepartmentSyncError(
            "apply requires --confirm SYNC-DEPARTMENT-INVENTORY"
        )
    if not dev_db_path.is_file():
        raise DepartmentSyncError(f"development DB not found: {dev_db_path}")
    if not employee_db_path.is_file():
        raise DepartmentSyncError(f"employee DB not found: {employee_db_path}")
    employee_hash_before = _hash_file(employee_db_path)
    snapshot = extractor(source_dir)
    with tempfile.TemporaryDirectory(prefix="mes-employee-master-") as temp_name:
        employee_snapshot = Path(temp_name) / "employee.db"
        _copy_read_only_sqlite(employee_db_path, employee_snapshot)
        if _hash_file(employee_db_path) != employee_hash_before:
            raise DepartmentSyncError("employee DB changed while creating read-only snapshot")
        engine = create_engine(
            f"sqlite:///{dev_db_path.resolve().as_posix()}",
            connect_args={"check_same_thread": False},
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        try:
            with SessionLocal() as db:
                preview = run_sync(db, employee_snapshot, snapshot, apply=False)
            if not apply:
                return preview
            if backup_fn is None:
                from scripts.ops.backup_db import backup_sqlite

                backup_fn = backup_sqlite
            backup_fn(str(dev_db_path.resolve()))
            with SessionLocal() as db:
                return run_sync(db, employee_snapshot, snapshot, apply=True)
        finally:
            engine.dispose()


def _write_report(summary: SyncSummary) -> Path:
    """Write one ignored JSON execution report under the permanent runtime tree."""
    from scripts.runtime_paths import runtime_path

    report_dir = runtime_path("department_inventory_sync", create=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    report_path = report_dir / f"department_inventory_{timestamp}.json"
    report_path.write_text(
        json.dumps(asdict(summary), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return report_path


def _console_json(value: object) -> str:
    """Return ASCII-only JSON so legacy Windows terminals cannot break the run."""
    return json.dumps(value, ensure_ascii=True, indent=2)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    """Parse the explicit source and DB paths for safe operational use."""
    parser = argparse.ArgumentParser(
        description="Synchronize confirmed department current stock in development DEXCOWIN MES."
    )
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--dev-db", type=Path, default=BACKEND_DIR / "mes.db")
    parser.add_argument("--employee-db", type=Path, default=Path(r"C:\ERP-dev\backend\mes.db"))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Execute the sync, print its JSON summary, and persist the report."""
    args = _parse_args(argv)
    try:
        summary = execute_sync(
            source_dir=args.source_dir,
            dev_db_path=args.dev_db,
            employee_db_path=args.employee_db,
            apply=args.apply,
            confirm=args.confirm,
        )
    except DepartmentSyncError as exc:
        print(f"[DEPARTMENT SYNC] ERROR: {exc}", file=sys.stderr)
        return 2
    report_path = _write_report(summary)
    mode = "APPLIED" if summary.applied else "DRY-RUN"
    print(f"[DEPARTMENT SYNC] {mode}")
    print(_console_json(asdict(summary)))
    print(f"REPORT_PATH={report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
