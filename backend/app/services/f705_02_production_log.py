"""F705-02 annual production log generation from MES production history.

The workbook is rendered by updating only the workbook and worksheet XML parts
inside the source XLSX package.  Saving the source through openpyxl would drop
Excel-only layout data that makes the quality-record form look original.
"""

from __future__ import annotations

import re
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Mapping
from xml.etree import ElementTree as ET

import holidays
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Item, ProductSymbol, TransactionLog, TransactionTypeEnum


TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "assets" / "f705_02_template.xlsx"
WORKBOOK_XML = "xl/workbook.xml"
WORKSHEET_XMLS = tuple(f"xl/worksheets/sheet{index}.xml" for index in range(1, 13))

_XLSX_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
_CELL_REF_RE = re.compile(r"([A-Z]+)(\d+)$")
_Q = lambda name: f"{{{_XLSX_NS}}}{name}"
_PROCESS_CODES = ("HF", "VF", "NF", "AF", "PF")
_MODELS = ("DX3000", "ADX4000W", "ADX6000FB", "COCOON", "SOLO")
_ROW_MAP = {
    "HF": {"DX3000": 3, "ADX4000W": 4, "ADX6000FB": 5, "COCOON": 6, "SOLO": 7},
    "VF": {"DX3000": 9, "ADX4000W": 10, "ADX6000FB": 11, "COCOON": 12, "SOLO": 13},
    "NF": {"DX3000": 15, "ADX4000W": 16, "ADX6000FB": 17, "COCOON": 18, "SOLO": 19},
    "AF": {"DX3000": 21, "ADX4000W": 22, "ADX6000FB": 23, "COCOON": 24, "SOLO": 25},
    "PF": {"DX3000": 27, "ADX4000W": 28, "ADX6000FB": 29, "COCOON": 30, "SOLO": 31},
}
_TOTAL_ROWS = {"HF": 8, "VF": 14, "NF": 20, "AF": 26, "PF": 32}
_IGNORABLE_NAMESPACE_DECLARATIONS = {
    "x15": "http://schemas.microsoft.com/office/spreadsheetml/2010/11/main",
    "x14ac": "http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac",
    "xr": "http://schemas.microsoft.com/office/spreadsheetml/2014/revision",
    "xr2": "http://schemas.microsoft.com/office/spreadsheetml/2015/revision2",
    "xr3": "http://schemas.microsoft.com/office/spreadsheetml/2016/revision3",
    "xr6": "http://schemas.microsoft.com/office/spreadsheetml/2016/revision6",
    "xr10": "http://schemas.microsoft.com/office/spreadsheetml/2016/revision10",
}

ET.register_namespace("", _XLSX_NS)

DailyQuantities = dict[date, dict[tuple[str, str], int]]


def _resolve_model(item: Item, symbols: Mapping[str, str]) -> str | None:
    """Resolve the same one-character product-symbol model used by weekly reporting."""
    symbol = (item.model_symbol or "").strip()
    if len(symbol) != 1:
        return None
    model = symbols.get(symbol)
    return model if model in _MODELS else None


def collect_daily_quantities(db: Session, year: int) -> DailyQuantities:
    """Return F705 model/process quantities using the frozen weekly production rule.

    The sum is first calculated for each item on each calendar day, then made
    absolute.  This matches the weekly matrix's item-level aggregation when a
    report is queried for one day.
    """
    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)
    logs_and_items = (
        db.query(Item, TransactionLog.quantity_change, TransactionLog.created_at)
        .join(TransactionLog, Item.item_id == TransactionLog.item_id)
        .filter(
            Item.process_type_code.in_(_PROCESS_CODES),
            TransactionLog.transaction_type == TransactionTypeEnum.PRODUCE,
            TransactionLog.created_at >= start,
            TransactionLog.created_at < end,
        )
        .all()
    )
    symbols = {
        row.symbol: row.model_name
        for row in (
            db.query(ProductSymbol)
            .filter(
                ProductSymbol.symbol.isnot(None),
                func.length(ProductSymbol.symbol) == 1,
                ProductSymbol.model_name.isnot(None),
            )
            .order_by(ProductSymbol.slot)
            .all()
        )
    }
    by_item_day: dict[tuple[date, str, str, str], Decimal] = defaultdict(lambda: Decimal("0"))
    for item, quantity_change, created_at in logs_and_items:
        model = _resolve_model(item, symbols)
        process = item.process_type_code or ""
        if model is None or process not in _ROW_MAP or created_at is None:
            continue
        key = (created_at.date(), str(item.item_id), process, model)
        by_item_day[key] += Decimal(str(quantity_change or 0))

    quantities: DailyQuantities = {}
    for (occurred_on, _item_id, process, model), quantity in by_item_day.items():
        absolute_quantity = int(abs(quantity))
        if absolute_quantity == 0:
            continue
        daily_quantities = quantities.setdefault(occurred_on, {})
        daily_quantities[(process, model)] = daily_quantities.get((process, model), 0) + absolute_quantity
    return quantities


def _excel_date(value: date) -> int:
    """Convert a date to Excel's 1900-date-system serial number."""
    return (value - date(1899, 12, 30)).days


def _column_name(cell: ET.Element) -> str:
    match = _CELL_REF_RE.fullmatch(cell.attrib.get("r", ""))
    if match is None:
        raise ValueError(f"Invalid XLSX cell reference: {cell.attrib.get('r')}")
    return match.group(1)


def _cell_by_column(row: ET.Element, column: str, row_number: int) -> ET.Element:
    for cell in row.findall(_Q("c")):
        if _column_name(cell) == column:
            return cell
    cell = ET.Element(_Q("c"), {"r": f"{column}{row_number}"})
    row.append(cell)
    return cell


def _clear_cell_value(cell: ET.Element) -> None:
    cell.attrib.pop("t", None)
    for child in list(cell):
        if child.tag in {_Q("v"), _Q("is"), _Q("f")}:
            cell.remove(child)


def _set_number(cell: ET.Element, value: int) -> None:
    _clear_cell_value(cell)
    ET.SubElement(cell, _Q("v")).text = str(value)


def _set_formula_cache(cell: ET.Element, value: int) -> None:
    """Refresh a formula result without replacing the original formula."""
    cell.attrib.pop("t", None)
    value_node = cell.find(_Q("v"))
    if value_node is None:
        value_node = ET.Element(_Q("v"))
        formula = cell.find(_Q("f"))
        if formula is None:
            cell.append(value_node)
        else:
            cell.insert(list(cell).index(formula) + 1, value_node)
    value_node.text = str(value)


def _sheet_rows(root: ET.Element) -> dict[int, ET.Element]:
    sheet_data = root.find(f".//{_Q('sheetData')}")
    if sheet_data is None:
        raise RuntimeError("F705-02 template has no sheet data.")
    return {int(row.attrib["r"]): row for row in sheet_data.findall(_Q("row"))}


def _set_holiday_formula(root: ET.Element, year: int) -> None:
    holiday_dates = sorted(
        holiday
        for holiday in holidays.country_holidays("KR", years=[year], observed=True)
        if holiday.year == year
    )
    formula = (
        "OR(" + ",".join(f"D$2=DATE({holiday.year},{holiday.month},{holiday.day})" for holiday in holiday_dates) + ")"
        if holiday_dates
        else "FALSE"
    )
    for conditional in root.findall(f".//{_Q('conditionalFormatting')}"):
        for rule in conditional.findall(_Q("cfRule")):
            for formula_node in rule.findall(_Q("formula")):
                if (formula_node.text or "").strip().upper() == "FALSE":
                    formula_node.text = formula
                    return
    raise RuntimeError("F705-02 template is missing the holiday conditional-format placeholder.")


def _populate_worksheet(
    template_xml: bytes,
    year: int,
    month: int,
    daily_quantities: DailyQuantities,
) -> bytes:
    """Fill one monthly form while retaining its original formulas and styles."""
    root = ET.fromstring(template_xml)
    rows = _sheet_rows(root)
    first_day = date(year, month, 1)
    _set_number(_cell_by_column(rows[1], "D", 1), _excel_date(first_day))
    for offset in range(31):
        column = _column_for_day(offset + 1)
        _set_formula_cache(
            _cell_by_column(rows[2], column, 2),
            _excel_date(first_day + timedelta(days=offset)),
        )

    values: dict[tuple[str, str], list[int]] = {
        (process, model): [0] * 31
        for process in _PROCESS_CODES
        for model in _MODELS
    }
    for occurred_on, quantities in daily_quantities.items():
        if occurred_on.year != year or occurred_on.month != month:
            continue
        for key, quantity in quantities.items():
            if key in values:
                values[key][occurred_on.day - 1] += quantity

    for process in _PROCESS_CODES:
        for model, row_number in _ROW_MAP[process].items():
            for day_number, quantity in enumerate(values[(process, model)], start=1):
                cell = _cell_by_column(rows[row_number], _column_for_day(day_number), row_number)
                if quantity:
                    _set_number(cell, quantity)
                else:
                    _clear_cell_value(cell)
            _set_formula_cache(_cell_by_column(rows[row_number], "AI", row_number), sum(values[(process, model)]))

        total_row = _TOTAL_ROWS[process]
        for day_number in range(1, 32):
            daily_total = sum(values[(process, model)][day_number - 1] for model in _MODELS)
            _set_formula_cache(_cell_by_column(rows[total_row], _column_for_day(day_number), total_row), daily_total)
        _set_formula_cache(
            _cell_by_column(rows[total_row], "AI", total_row),
            sum(sum(values[(process, model)]) for model in _MODELS),
        )

    _set_holiday_formula(root, year)
    return _restore_ignorable_namespaces(
        ET.tostring(root, encoding="utf-8", xml_declaration=True),
        root.get(f"{{{_MC_NS}}}Ignorable"),
    )


def _column_for_day(day_number: int) -> str:
    """Return the F705 daily input column for a one-based day number."""
    column_number = 3 + day_number
    result = ""
    while column_number:
        column_number, remainder = divmod(column_number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _populate_workbook(template_xml: bytes, year: int) -> bytes:
    root = ET.fromstring(template_xml)
    sheets = root.find(_Q("sheets"))
    if sheets is None:
        raise RuntimeError("F705-02 template has no workbook sheets.")
    sheet_nodes = sheets.findall(_Q("sheet"))
    if len(sheet_nodes) != 12:
        raise RuntimeError("F705-02 template must contain twelve monthly sheets.")
    for month, sheet in enumerate(sheet_nodes, start=1):
        sheet.set("name", f"{year % 100:02d}.{month:02d}")
    calculation = root.find(_Q("calcPr"))
    if calculation is None:
        calculation = ET.SubElement(root, _Q("calcPr"))
    calculation.set("calcMode", "auto")
    calculation.set("fullCalcOnLoad", "1")
    calculation.set("forceFullCalc", "1")
    return _restore_ignorable_namespaces(
        ET.tostring(root, encoding="utf-8", xml_declaration=True),
        root.get(f"{{{_MC_NS}}}Ignorable"),
    )


def _restore_ignorable_namespaces(xml: bytes, ignored_prefixes: str | None) -> bytes:
    """Retain every namespace named by mc:Ignorable after XML serialization."""
    if not ignored_prefixes:
        return xml
    prefixes = ignored_prefixes.split()
    unknown = set(prefixes) - _IGNORABLE_NAMESPACE_DECLARATIONS.keys()
    if unknown:
        raise RuntimeError(f"Unknown F705-02 ignorable namespaces: {sorted(unknown)}")
    root_start = xml.index(b"<", xml.index(b"?>") + 2) if xml.startswith(b"<?xml") else xml.index(b"<")
    root_end = xml.index(b">", root_start)
    root_tag = xml[root_start : root_end + 1]
    additions = b"".join(
        f' xmlns:{prefix}="{_IGNORABLE_NAMESPACE_DECLARATIONS[prefix]}"'.encode("ascii")
        for prefix in prefixes
        if f"xmlns:{prefix}=".encode("ascii") not in root_tag
    )
    return xml if not additions else xml[:root_end] + additions + xml[root_end:]


def render_workbook(year: int, daily_quantities: DailyQuantities) -> bytes:
    """Render the selected year into a copy of the clean F705-02 template."""
    if not TEMPLATE_PATH.is_file():
        raise RuntimeError(f"F705-02 template is missing: {TEMPLATE_PATH}")
    with zipfile.ZipFile(TEMPLATE_PATH, "r") as source_zip:
        infos = source_zip.infolist()
        payloads = {info.filename: source_zip.read(info.filename) for info in infos}
    if any(name not in payloads for name in (WORKBOOK_XML, *WORKSHEET_XMLS)):
        raise RuntimeError("F705-02 template does not contain the required XML parts.")

    payloads[WORKBOOK_XML] = _populate_workbook(payloads[WORKBOOK_XML], year)
    for month, worksheet_xml in enumerate(WORKSHEET_XMLS, start=1):
        payloads[worksheet_xml] = _populate_worksheet(payloads[worksheet_xml], year, month, daily_quantities)

    output = BytesIO()
    with zipfile.ZipFile(output, "w") as result_zip:
        for info in infos:
            result_zip.writestr(info, payloads[info.filename])
    return output.getvalue()
