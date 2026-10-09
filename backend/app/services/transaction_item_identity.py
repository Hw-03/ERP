"""Distinguish immutable transaction identity from the currently linked master."""
from app.models import Item, TransactionLog


def transaction_item_identity(log: TransactionLog, item: Item) -> dict:
    """Legacy NULL uses current labels without claiming those labels were recorded at the time."""
    snapshot = log.item_snapshot
    preserved = isinstance(snapshot, dict) and bool(snapshot.get("item_name")) and bool(snapshot.get("unit"))
    value = snapshot if preserved else {
        "item_name": item.item_name, "mes_code": item.mes_code,
        "process_type_code": item.process_type_code, "unit": item.unit,
    }
    return {
        "item_name": value["item_name"], "mes_code": value.get("mes_code"),
        "item_process_type_code": value.get("process_type_code"), "item_unit": value["unit"],
        "item_snapshot_preserved": preserved,
        "current_item_name": item.item_name, "current_mes_code": item.mes_code,
    }
