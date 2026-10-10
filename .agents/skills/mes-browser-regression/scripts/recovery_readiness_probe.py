"""동결 원형은 보존하고 QA readiness 요청만 전체 기한 안에서 기다린다."""

from contextlib import contextmanager
import hashlib
from pathlib import Path
import sys
import time
from typing import Iterator
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[4]
sys.path[:0] = [str(ROOT), str(ROOT / "backend/tests/ops")]
import recovery_rehearsal as harness  # noqa: E402

HARNESS_SHA = "ed6e1c36d2463492860cee47de23dcb4744e88318f567b6b6a71fb11fdc00b9f"


def bounded_probe(self: harness.IsolatedLifecycle, url: str) -> bytes:
    """전체 90초를 유지하며 요청·대기와 본문 수신 후 판정을 기한에 묶는다."""
    deadline = time.monotonic() + 90
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        if any(process.poll() is not None for process, _, _ in self.processes.values()):
            raise harness.release.ReleaseError("Isolated process exited before readiness; inspect local lifecycle logs")
        try:
            with urlopen(url, timeout=min(10, remaining)) as response:
                if response.status == 200 and response.geturl() == url:
                    body = response.read()
                    if time.monotonic() <= deadline:
                        return body
        except (OSError, URLError):
            pass
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.25, remaining))
    raise harness.release.ReleaseError("Isolated readiness timed out")


@contextmanager
def bounded_readiness() -> Iterator[None]:
    """실제 lifecycle의 다른 메서드와 복구 함수는 바꾸지 않는다."""
    source = ROOT / "backend/tests/ops/recovery_rehearsal.py"
    # Git 체크아웃의 CRLF/LF 차이만 허용하고 실제 소스 변경은 계속 거부한다.
    if hashlib.sha256(source.read_bytes().replace(b"\r\n", b"\n")).hexdigest() != HARNESS_SHA:
        raise harness.release.ReleaseError("Readiness adapter harness source changed")
    original = harness.IsolatedLifecycle._probe
    harness.IsolatedLifecycle._probe = bounded_probe
    try:
        yield
    finally:
        harness.IsolatedLifecycle._probe = original
