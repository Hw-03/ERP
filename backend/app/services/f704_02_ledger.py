"""F704-02 원본 양식 기반 연간 자재 입출고관리대장 생성.

원본 통합문서를 openpyxl로 다시 저장하면 프린터 설정과 VML 주석이 사라진다.
이 모듈은 정리된 원본 XLSX 패키지의 ``양식`` 시트 XML만 바꿔 서식을 보존한다.
"""

from __future__ import annotations

import copy
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime
from io import BytesIO
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    ProductSymbol,
    ShippingRequest,
    StockRequest,
    TransactionLog,
    TransactionTypeEnum,
)


SEOUL_TZ = ZoneInfo("Asia/Seoul")
TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "assets" / "f704_02_template.xlsx"
WORKSHEET_XML = "xl/worksheets/sheet1.xml"
_XLSX_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
_XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
_Q = lambda name: f"{{{_XLSX_NS}}}{name}"
_CELL_REF_RE = re.compile(r"([A-Z]+)(\d+)$")
_DATA_START_ROW = 4
_IGNORABLE_NAMESPACE_DECLARATIONS = {
    "x14ac": "http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac",
    "xr": "http://schemas.microsoft.com/office/spreadsheetml/2014/revision",
    "xr2": "http://schemas.microsoft.com/office/spreadsheetml/2015/revision2",
    "xr3": "http://schemas.microsoft.com/office/spreadsheetml/2016/revision3",
}

ET.register_namespace("", _XLSX_NS)


@dataclass(frozen=True)
class F704LedgerEntry:
    """F704-02 한 행에 채울, 창고 증감이 입증된 거래."""

    occurred_on: date
    created_at: datetime
    log_id: str
    item_code: str
    model_name: str
    item_name: str
    quantity: int
    direction: str
    counterpart: str
    requester: str
    remark: str


def _transaction_value(log: TransactionLog) -> str:
    value = log.transaction_type
    return value.value if hasattr(value, "value") else str(value)


def _to_kst(value: datetime) -> datetime:
    """DB의 UTC-naive 시각을 한국 표준시로 해석한다."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(SEOUL_TZ)


def _year_range_utc_naive(year: int) -> tuple[datetime, datetime]:
    """KST 연도 범위에 대응하는 DB(UTC-naive) 조회 범위를 만든다."""
    start = datetime(year, 1, 1, tzinfo=SEOUL_TZ).astimezone(UTC).replace(tzinfo=None)
    end = datetime(year + 1, 1, 1, tzinfo=SEOUL_TZ).astimezone(UTC).replace(tzinfo=None)
    return start, end


def _warehouse_delta_from_effect(effect: object) -> int | None:
    """inventory_effect가 있으면 창고 delta만 합산한다.

    ``None`` 은 효과 기록 자체가 없어 구형 보조 근거를 확인해야 함을 뜻하고,
    ``0`` 은 기록은 있으나 창고 변동이 없다는 뜻이다.
    """
    if effect is None:
        return None
    if not isinstance(effect, list):
        return 0
    deltas: list[int] = []
    for cell in effect:
        if isinstance(cell, dict) and cell.get("scope") == "warehouse":
            try:
                deltas.append(int(cell.get("delta", 0)))
            except (TypeError, ValueError):
                continue
    return sum(deltas)


def _warehouse_delta_from_line(line: IoLine | None) -> int | None:
    """입출고 라인의 창고 출발/도착을 신뢰할 수 있을 때만 수량을 반환한다."""
    if line is None:
        return None
    quantity = int(line.quantity or 0)
    if quantity <= 0:
        return None
    if line.from_bucket == "warehouse" and line.to_bucket != "warehouse":
        return -quantity
    if line.to_bucket == "warehouse" and line.from_bucket != "warehouse":
        return quantity
    return None


def _warehouse_delta_from_legacy(log: TransactionLog) -> int | None:
    """위치 효과가 없던 구형 거래의 좁은 창고 판별 보조 경로."""
    before = log.warehouse_qty_before
    after = log.warehouse_qty_after
    if before is not None and after is not None:
        delta = int(after) - int(before)
        return delta if delta else None

    tx_type = _transaction_value(log)
    quantity = abs(int(log.transfer_qty or log.quantity_change or 0))
    if quantity == 0:
        return None
    if tx_type in {TransactionTypeEnum.RECEIVE.value, TransactionTypeEnum.TRANSFER_TO_WH.value}:
        return quantity
    if tx_type in {
        TransactionTypeEnum.SHIP.value,
        TransactionTypeEnum.TRANSFER_TO_PROD.value,
        TransactionTypeEnum.SUPPLIER_RETURN.value,
        TransactionTypeEnum.INTERNAL_USE.value,
    }:
        return -quantity
    return None


def _warehouse_delta(log: TransactionLog, line: IoLine | None) -> int | None:
    """거래의 실제 창고 증감을 우선순위에 따라 판별한다."""
    effect_delta = _warehouse_delta_from_effect(log.inventory_effect)
    if effect_delta is not None:
        return effect_delta or None
    line_delta = _warehouse_delta_from_line(line)
    if line_delta is not None:
        return line_delta
    return _warehouse_delta_from_legacy(log)


def _counterpart_from_line(line: IoLine, delta: int) -> str:
    """창고 반대편 버킷의 부서명을 F704 입/출고처 표기로 정리한다."""
    if delta > 0:
        bucket, department = line.from_bucket, line.from_department
        fallback = "외부입고"
    else:
        bucket, department = line.to_bucket, line.to_department
        fallback = "출하" if bucket == "none" else "생산"
    if department and department.strip():
        return department.strip()
    if bucket == "production":
        return "생산"
    if bucket == "defective":
        return "불량"
    return fallback


def _counterpart(
    log: TransactionLog,
    batch: IoBatch | None,
    line: IoLine | None,
    delta: int,
) -> str:
    """실제 라인을 우선해 입/출고처를 정하고, 구형 로그는 보수적으로 표기한다."""
    if line is not None:
        return _counterpart_from_line(line, delta)
    if batch is not None:
        department = batch.from_department if delta > 0 else batch.to_department
        if department and department.strip():
            return department.strip()
    tx_type = _transaction_value(log)
    if tx_type == TransactionTypeEnum.RECEIVE.value:
        return "외부입고"
    if tx_type == TransactionTypeEnum.SHIP.value:
        return "출하"
    if tx_type == TransactionTypeEnum.SUPPLIER_RETURN.value:
        return "공급처"
    if log.department and log.department.strip():
        return log.department.strip()
    return "생산" if delta < 0 else "외부입고"


def _requester(
    batch: IoBatch | None,
    stock_request: StockRequest | None,
    shipping_request: ShippingRequest | None,
) -> str:
    """F704 담당자 칸에는 처리자가 아닌 요청자를 우선순위대로 넣는다."""
    for value in (
        batch.requester_name if batch is not None else None,
        stock_request.requester_name if stock_request is not None else None,
        shipping_request.requested_by_name if shipping_request is not None else None,
    ):
        if value and value.strip():
            return value.strip()
    return ""


def _model_name(item: Item, symbols: dict[str, str]) -> str:
    """단일 제품 기호에 연결된 모델명만 표시하고 공용 부품은 비운다."""
    symbol = (item.model_symbol or "").strip()
    return symbols.get(symbol, "") if len(symbol) == 1 else ""


def _remark(log: TransactionLog) -> str:
    """참조번호와 메모를 한 셀에 중복 없이 합친다."""
    values = [
        value.strip().replace("\r", " ").replace("\n", " ")
        for value in (log.reference_no, log.notes)
        if value and value.strip()
    ]
    return " · ".join(values)


def _line_map(db: Session, batch_ids: set[object]) -> dict[tuple[object, object], list[IoLine]]:
    """배치·품목별 실제 반영 라인을 미리 적재해 행 수 곱셈 조인을 피한다."""
    if not batch_ids:
        return {}
    result: dict[tuple[object, object], list[IoLine]] = defaultdict(list)
    rows = (
        db.query(IoBundle.batch_id, IoLine)
        .join(IoLine, IoLine.bundle_id == IoBundle.bundle_id)
        .filter(IoBundle.batch_id.in_(batch_ids), IoLine.included.is_(True))
        .all()
    )
    for batch_id, line in rows:
        result[(batch_id, line.item_id)].append(line)
    return result


def collect_entries(db: Session, year: int) -> list[F704LedgerEntry]:
    """선택한 KST 연도에 실제 창고가 변한 거래만 F704 행으로 변환한다."""
    start, end = _year_range_utc_naive(year)
    logs_and_items = (
        db.query(TransactionLog, Item)
        .join(Item, Item.item_id == TransactionLog.item_id)
        .filter(
            TransactionLog.created_at >= start,
            TransactionLog.created_at < end,
            TransactionLog.cancelled.is_(False),
            TransactionLog.archived_at.is_(None),
        )
        .order_by(TransactionLog.created_at.asc(), TransactionLog.log_id.asc())
        .all()
    )
    batch_ids = {log.operation_batch_id for log, _item in logs_and_items if log.operation_batch_id}
    batches = (
        db.query(IoBatch).filter(IoBatch.batch_id.in_(batch_ids)).all()
        if batch_ids else []
    )
    batch_by_id = {batch.batch_id: batch for batch in batches}
    lines_by_batch_item = _line_map(db, batch_ids)

    stock_request_ids = {batch.stock_request_id for batch in batches if batch.stock_request_id}
    stock_requests = (
        db.query(StockRequest).filter(StockRequest.request_id.in_(stock_request_ids)).all()
        if stock_request_ids else []
    )
    stock_request_by_id = {request.request_id: request for request in stock_requests}

    shipping_ids = {log.shipping_request_id for log, _item in logs_and_items if log.shipping_request_id}
    shipping_requests = (
        db.query(ShippingRequest).filter(ShippingRequest.request_id.in_(shipping_ids)).all()
        if shipping_ids else []
    )
    shipping_by_id = {request.request_id: request for request in shipping_requests}

    symbols = {
        symbol.symbol: symbol.model_name
        for symbol in db.query(ProductSymbol).all()
        if symbol.symbol and symbol.model_name
    }

    entries: list[F704LedgerEntry] = []
    for log, item in logs_and_items:
        batch = batch_by_id.get(log.operation_batch_id)
        candidate_lines = lines_by_batch_item.get((log.operation_batch_id, item.item_id), [])
        line = candidate_lines[0] if len(candidate_lines) == 1 else None
        delta = _warehouse_delta(log, line)
        if delta is None:
            continue
        created_at = _to_kst(log.created_at)
        stock_request = stock_request_by_id.get(batch.stock_request_id) if batch is not None else None
        shipping_request = shipping_by_id.get(log.shipping_request_id)
        entries.append(
            F704LedgerEntry(
                occurred_on=created_at.date(),
                created_at=created_at,
                log_id=str(log.log_id),
                item_code=item.mes_code or "",
                model_name=_model_name(item, symbols),
                item_name=item.item_name or "",
                quantity=abs(delta),
                direction="입고" if delta > 0 else "출고",
                counterpart=_counterpart(log, batch, line, delta),
                requester=_requester(batch, stock_request, shipping_request),
                remark=_remark(log),
            )
        )
    return entries


def _clear_cell_value(cell: ET.Element) -> None:
    cell.attrib.pop("t", None)
    for child in list(cell):
        if child.tag in {_Q("v"), _Q("is"), _Q("f")}:
            cell.remove(child)


def _set_number(cell: ET.Element, value: int) -> None:
    _clear_cell_value(cell)
    value_node = ET.SubElement(cell, _Q("v"))
    value_node.text = str(value)


def _set_text(cell: ET.Element, value: str) -> None:
    _clear_cell_value(cell)
    if not value:
        return
    cell.set("t", "inlineStr")
    inline = ET.SubElement(cell, _Q("is"))
    text = ET.SubElement(inline, _Q("t"))
    if value[:1].isspace() or value[-1:].isspace():
        text.set(_XML_SPACE, "preserve")
    text.text = value


def _excel_date(value: date) -> int:
    """Excel의 1900 날짜 체계(윤년 버그 포함)에 맞는 날짜 일련번호."""
    return (value - date(1899, 12, 30)).days


def _column_name(cell: ET.Element) -> str:
    match = _CELL_REF_RE.fullmatch(cell.attrib.get("r", ""))
    if match is None:
        raise ValueError(f"잘못된 XLSX 셀 참조: {cell.attrib.get('r')}")
    return match.group(1)


def _cell_by_column(row: ET.Element, column: str, row_number: int) -> ET.Element:
    for cell in row.findall(_Q("c")):
        if _column_name(cell) == column:
            return cell
    cell = ET.Element(_Q("c"), {"r": f"{column}{row_number}"})
    row.append(cell)
    return cell


def _rewrite_row_number(row: ET.Element, row_number: int) -> None:
    row.set("r", str(row_number))
    for cell in row.findall(_Q("c")):
        cell.set("r", f"{_column_name(cell)}{row_number}")


def _data_rows(sheet_root: ET.Element, required_last_row: int) -> dict[int, ET.Element]:
    sheet_data = sheet_root.find(f".//{_Q('sheetData')}")
    if sheet_data is None:
        raise RuntimeError("F704-02 템플릿에 sheetData가 없습니다.")
    rows = {int(row.attrib["r"]): row for row in sheet_data.findall(_Q("row"))}
    if not rows:
        raise RuntimeError("F704-02 템플릿에 데이터 행이 없습니다.")
    template_last_row = max(rows)
    template_row = rows[template_last_row]
    for row_number in range(template_last_row + 1, required_last_row + 1):
        clone = copy.deepcopy(template_row)
        _rewrite_row_number(clone, row_number)
        sheet_data.append(clone)
        rows[row_number] = clone
    return rows


def _unhide_requester_column(sheet_root: ET.Element) -> None:
    columns = sheet_root.find(_Q("cols"))
    if columns is None:
        raise RuntimeError("F704-02 템플릿에 열 정의가 없습니다.")
    for column in columns.findall(_Q("col")):
        if int(column.attrib["min"]) <= 11 <= int(column.attrib["max"]):
            column.attrib.pop("hidden", None)
            return
    raise RuntimeError("F704-02 템플릿에 담당자(K) 열이 없습니다.")


def _reset_ledger_initial_view(sheet_root: ET.Element) -> None:
    """Open the populated ledger at its first data row without changing frozen rows."""
    sheet_view = sheet_root.find(f"{_Q('sheetViews')}/{_Q('sheetView')}")
    if sheet_view is None:
        raise RuntimeError("F704-02 템플릿에 시트 보기 설정이 없습니다.")
    pane = sheet_view.find(_Q("pane"))
    if pane is None:
        raise RuntimeError("F704-02 템플릿에 고정 창 설정이 없습니다.")

    first_data_cell = f"A{_DATA_START_ROW}"
    pane.set("topLeftCell", first_data_cell)
    for selection in sheet_view.findall(_Q("selection")):
        if selection.attrib.get("pane") == "bottomLeft":
            selection.set("activeCell", first_data_cell)
            selection.set("sqref", first_data_cell)
            return
    raise RuntimeError("F704-02 템플릿에 본문 선택 영역이 없습니다.")


def _update_ranges(sheet_root: ET.Element, last_row: int) -> None:
    dimension = sheet_root.find(_Q("dimension"))
    if dimension is not None:
        dimension.set("ref", f"A1:P{last_row}")
    auto_filter = sheet_root.find(_Q("autoFilter"))
    if auto_filter is not None:
        auto_filter.set("ref", f"A3:M{last_row}")


def _restore_ignorable_namespace_declarations(
    worksheet_xml: bytes,
    ignored_prefixes: str | None,
) -> bytes:
    """Keep every prefix named by mc:Ignorable bound after ElementTree serialization."""
    if not ignored_prefixes:
        return worksheet_xml
    prefixes = ignored_prefixes.split()
    unknown = set(prefixes) - _IGNORABLE_NAMESPACE_DECLARATIONS.keys()
    if unknown:
        raise RuntimeError(f"F704-02 템플릿의 알 수 없는 호환성 네임스페이스: {sorted(unknown)}")

    worksheet_start = worksheet_xml.index(b"<worksheet")
    root_end = worksheet_xml.index(b">", worksheet_start)
    root_tag = worksheet_xml[worksheet_start : root_end + 1]
    additions = b"".join(
        f' xmlns:{prefix}="{_IGNORABLE_NAMESPACE_DECLARATIONS[prefix]}"'.encode("ascii")
        for prefix in prefixes
        if f"xmlns:{prefix}=".encode("ascii") not in root_tag
    )
    if not additions:
        return worksheet_xml
    return worksheet_xml[:root_end] + additions + worksheet_xml[root_end:]


def _populate_worksheet(template_xml: bytes, entries: Iterable[F704LedgerEntry]) -> bytes:
    """원본 양식 시트의 기존 셀 스타일을 유지한 채 거래값만 채운 XML을 만든다."""
    entries = list(entries)
    root = ET.fromstring(template_xml)
    last_row = max(_DATA_START_ROW, _DATA_START_ROW + len(entries) - 1)
    rows = _data_rows(root, last_row)
    _unhide_requester_column(root)
    _reset_ledger_initial_view(root)
    _update_ranges(root, max(rows))

    for offset, entry in enumerate(entries):
        row_number = _DATA_START_ROW + offset
        row = rows[row_number]
        values = {
            "A": ("number", offset + 1),
            "B": ("number", _excel_date(entry.occurred_on)),
            "C": ("text", ""),
            "D": ("text", entry.item_code),
            "E": ("text", entry.model_name),
            "F": ("text", entry.item_name),
            "G": ("text", ""),
            "H": ("number", entry.quantity),
            "I": ("text", entry.direction),
            "J": ("text", entry.counterpart),
            "K": ("text", entry.requester),
            "L": ("text", ""),
            "M": ("text", entry.remark),
        }
        for column, (kind, value) in values.items():
            cell = _cell_by_column(row, column, row_number)
            if kind == "number":
                _set_number(cell, int(value))
            else:
                _set_text(cell, str(value))
    return _restore_ignorable_namespace_declarations(
        ET.tostring(root, encoding="utf-8", xml_declaration=True),
        root.get(f"{{{_MC_NS}}}Ignorable"),
    )


def render_workbook(entries: Iterable[F704LedgerEntry]) -> bytes:
    """템플릿의 비시각 요소를 유지한 F704-02 XLSX 패키지를 반환한다."""
    if not TEMPLATE_PATH.is_file():
        raise RuntimeError(f"F704-02 템플릿을 찾을 수 없습니다: {TEMPLATE_PATH}")
    with zipfile.ZipFile(TEMPLATE_PATH, "r") as source_zip:
        infos = source_zip.infolist()
        payloads = {info.filename: source_zip.read(info.filename) for info in infos}
    payloads[WORKSHEET_XML] = _populate_worksheet(payloads[WORKSHEET_XML], entries)

    output = BytesIO()
    with zipfile.ZipFile(output, "w") as result_zip:
        for info in infos:
            result_zip.writestr(info, payloads[info.filename])
    return output.getvalue()
