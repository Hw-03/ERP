"""A new nullable snapshot never invents historical master values."""
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


def test_transaction_snapshot_native_add_preserves_existing_logs_and_null(tmp_path: Path) -> None:
    database = tmp_path / "transaction-snapshot.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database.as_posix()}")
    command.upgrade(config, "20261007_0042")
    with sqlite3.connect(database) as db:
        columns = [row[1] for row in db.execute('PRAGMA table_info("transaction_logs")')]
        db.execute("INSERT INTO product_symbols (slot, symbol, model_name, is_finished_good, is_reserved) VALUES (1, '3', 'History', 0, 0)")
        db.execute("INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('TR', 'T', 'R', 0)")
        db.execute("INSERT INTO items (item_id, item_name, unit, model_symbol, process_type_code, serial_no) VALUES (?, 'current', 'EA', '3', 'TR', 1)", ('a' * 32,))
        db.execute("INSERT INTO transaction_logs (log_id, item_id, transaction_type, quantity_change) VALUES (?, ?, 'RECEIVE', 1)", ('b' * 32, 'a' * 32))
        before = db.execute('SELECT * FROM transaction_logs').fetchall()
        rootpage = db.execute("SELECT rootpage FROM sqlite_master WHERE name='transaction_logs'").fetchone()
    command.upgrade(config, "20261007_0043")
    with sqlite3.connect(database) as db:
        projection = ', '.join(f'"{column}"' for column in columns)
        assert db.execute(f'SELECT {projection} FROM transaction_logs').fetchall() == before
        assert db.execute('SELECT item_snapshot FROM transaction_logs').fetchall() == [(None,)]
        assert db.execute("SELECT rootpage FROM sqlite_master WHERE name='transaction_logs'").fetchone() == rootpage
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []
