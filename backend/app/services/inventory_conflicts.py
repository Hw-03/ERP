"""Retryable/ambiguous inventory conflicts must not become failed approvals."""


class InventoryConflict(Exception):
    """A domain conflict whose structured code survives every transaction boundary."""

    def __init__(self, code: str, message: str, *, status_code: int = 409, extra: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.extra = extra or {}
