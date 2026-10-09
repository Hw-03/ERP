"""QA-only employee display names, applied before the isolated E2E server starts."""
from contextlib import closing
import os
from pathlib import Path
import sqlite3

E2E_DATABASE = Path(__file__).resolve().parents[3] / "backend" / "mes_e2e.db"


def anonymize_employees() -> int:
    """Replace only display names in the dedicated E2E database."""
    database = E2E_DATABASE
    expected_url = f"sqlite:///{database.as_posix()}"
    if not database.is_absolute() or database.name != "mes_e2e.db" or os.environ.get("DATABASE_URL") != expected_url:
        raise ValueError("Employee anonymization requires the dedicated E2E DATABASE_URL")
    if not database.is_file():
        raise ValueError("Employee anonymization requires an existing E2E database")
    if database.is_symlink() or database.resolve() != database or database.stat().st_nlink != 1:
        raise ValueError("Employee anonymization requires an independent E2E database file")
    with closing(sqlite3.connect(f"{database.as_uri()}?mode=rw", uri=True)) as connection, connection:
        cursor = connection.execute("UPDATE employees SET name = ? || employee_code", ("QA-Employee-",))
        return cursor.rowcount


if __name__ == "__main__":
    print(anonymize_employees())
