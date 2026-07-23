"""F704-02 XML 패키지 렌더링 단위 테스트."""

from __future__ import annotations

import re
import zipfile
from datetime import date, datetime
from io import BytesIO
from types import SimpleNamespace

from openpyxl import load_workbook

from app.services.f704_02_ledger import F704LedgerEntry, TEMPLATE_PATH, _requester, render_workbook


_IGNORABLE_ATTRIBUTE_RE = re.compile(rb"(?:[A-Za-z_][\w.-]*:)?Ignorable=[\"']([^\"']+)[\"']")
_NAMESPACE_DECLARATION_RE = re.compile(rb"xmlns:([A-Za-z_][\w.-]*)=[\"']")


def _missing_ignorable_namespace_prefixes(worksheet_xml: bytes) -> set[str]:
    worksheet_start = worksheet_xml.index(b"<worksheet")
    root_tag = worksheet_xml[worksheet_start : worksheet_xml.index(b">", worksheet_start) + 1]
    ignored = _IGNORABLE_ATTRIBUTE_RE.search(root_tag)
    assert ignored is not None
    declared = {prefix.decode("ascii") for prefix in _NAMESPACE_DECLARATION_RE.findall(root_tag)}
    return set(ignored.group(1).decode("ascii").split()) - declared


def _entry(sequence: int) -> F704LedgerEntry:
    return F704LedgerEntry(
        occurred_on=date(2026, 1, 1),
        created_at=datetime(2026, 1, 1, 9, 0),
        log_id=f"log-{sequence}",
        item_code=f"9-TR-{sequence:04d}",
        model_name="COCOON",
        item_name=f"확장 품목 {sequence}",
        quantity=1,
        direction="입고",
        counterpart="외부입고",
        requester="요청자",
        remark="",
    )


def test_render_workbook_extends_template_rows_with_same_data_style():
    """원본 양식의 사전 서식 행을 넘으면 마지막 행 서식으로 연장한다."""
    rendered = render_workbook(_entry(index) for index in range(1, 1935))

    worksheet = load_workbook(BytesIO(rendered), data_only=False)["양식"]
    assert worksheet["A1937"].value == 1934
    assert worksheet["F1937"].value == "확장 품목 1934"
    assert worksheet.auto_filter.ref == "A3:M1937"
    assert worksheet["H1937"].style_id == worksheet["H1936"].style_id


def test_render_workbook_opens_ledger_at_first_data_row():
    rendered = render_workbook([_entry(1)])

    worksheet = load_workbook(BytesIO(rendered), data_only=False)["양식"]
    assert worksheet.sheet_view.pane is not None
    assert worksheet.sheet_view.pane.ySplit == 3
    assert worksheet.sheet_view.pane.topLeftCell == "A4"
    bottom_selection = next(
        selection for selection in worksheet.sheet_view.selection if selection.pane == "bottomLeft"
    )
    assert bottom_selection.activeCell == "A4"
    assert bottom_selection.sqref == "A4"


def test_template_and_rendered_worksheets_declare_ignored_namespaces():
    rendered = render_workbook([_entry(1)])

    for package in (TEMPLATE_PATH, BytesIO(rendered)):
        with zipfile.ZipFile(package) as archive:
            for worksheet in ("xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"):
                assert _missing_ignorable_namespace_prefixes(archive.read(worksheet)) == set()


def test_requester_uses_io_batch_then_stock_request_then_shipping_request():
    batch = SimpleNamespace(requester_name="IO requester")
    stock_request = SimpleNamespace(requester_name="stock requester")
    shipping_request = SimpleNamespace(requested_by_name="shipping requester")

    assert _requester(batch, stock_request, shipping_request) == "IO requester"
    assert _requester(SimpleNamespace(requester_name=" "), stock_request, shipping_request) == "stock requester"
    assert _requester(None, None, shipping_request) == "shipping requester"


def test_template_keeps_both_forms_but_has_no_ledger_values():
    workbook = load_workbook(TEMPLATE_PATH, data_only=False)

    assert workbook.sheetnames == ["양식", "양식_출력용"]
    for worksheet in workbook.worksheets:
        for row in worksheet.iter_rows(min_row=4, max_col=13):
            assert all(cell.value is None for cell in row[1:])
