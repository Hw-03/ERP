"""Reservation contract errors must never become a persisted approval failure."""
from typing import Any


class WorkReservationError(Exception):
    """Carry stable HTTP details without inheriting the legacy ValueError boundary."""

    def __init__(self, code: str, message: str, status_code: int = 409,
                 extra: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.extra = extra
