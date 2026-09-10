"""한 backend process 수명 동안 공유하는 runtime identity."""

from __future__ import annotations

from datetime import datetime
import uuid


BOOT_ID: str = uuid.uuid4().hex
BOOT_STARTED_AT: str = datetime.utcnow().isoformat()


def current_boot_id() -> str:
    return BOOT_ID
