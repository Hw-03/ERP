"""Backend file logging regression tests."""

from __future__ import annotations

import logging
import multiprocessing
import os

import pytest
from concurrent_log_handler import ConcurrentRotatingFileHandler

from app._logging import setup_logging


def _clear_mes_logger(*, close_handlers: bool = True) -> None:
    """Remove and close handlers installed by a logging test."""
    logger = logging.getLogger("mes")
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        if close_handlers:
            handler.close()
    if hasattr(logger, "_mes_configured"):
        delattr(logger, "_mes_configured")


@pytest.fixture(autouse=True)
def _isolated_mes_logger():
    """Keep setup_logging's application-global logger out of other tests."""
    logger = logging.getLogger("mes")
    previous_handlers = logger.handlers[:]
    previous_level = logger.level
    previous_propagate = logger.propagate
    previous_configured = getattr(logger, "_mes_configured", None)

    _clear_mes_logger(close_handlers=False)
    yield
    _clear_mes_logger()

    for handler in previous_handlers:
        logger.addHandler(handler)
    logger.setLevel(previous_level)
    logger.propagate = previous_propagate
    if previous_configured is None:
        if hasattr(logger, "_mes_configured"):
            delattr(logger, "_mes_configured")
    else:
        logger._mes_configured = previous_configured  # type: ignore[attr-defined]


def _write_rotating_logs(runtime_root: str, worker_id: int, start_event) -> None:
    """Write enough distinct lines to force concurrent rotation in one process."""
    os.environ["MES_RUNTIME_ROOT"] = runtime_root
    os.environ["LOG_BACKUP_COUNT"] = "32"
    _clear_mes_logger()
    logger = setup_logging(max_bytes=1024)
    start_event.wait(timeout=10)
    for record_id in range(40):
        logger.info("worker-%s-record-%s %s", worker_id, record_id, "x" * 80)
    _clear_mes_logger()


def test_setup_logging_uses_concurrent_utf8_rotation_with_console(tmp_path, monkeypatch):
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path))
    monkeypatch.delenv("LOG_BACKUP_COUNT", raising=False)

    logger = setup_logging(max_bytes=1024)

    file_handlers = [
        handler
        for handler in logger.handlers
        if isinstance(handler, ConcurrentRotatingFileHandler)
    ]
    assert len(file_handlers) == 1
    assert file_handlers[0].maxBytes == 1024
    assert file_handlers[0].backupCount == 5
    assert file_handlers[0].encoding == "utf-8"
    assert any(
        isinstance(handler, logging.StreamHandler)
        and not isinstance(handler, ConcurrentRotatingFileHandler)
        for handler in logger.handlers
    )


@pytest.mark.parametrize("backup_count", ["0", "-1"])
def test_setup_logging_uses_default_for_nonpositive_backup_count(
    tmp_path,
    monkeypatch,
    backup_count,
):
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path))
    monkeypatch.setenv("LOG_BACKUP_COUNT", backup_count)

    logger = setup_logging(max_bytes=1024)

    file_handler = next(
        handler
        for handler in logger.handlers
        if isinstance(handler, ConcurrentRotatingFileHandler)
    )
    assert file_handler.backupCount == 5


def test_concurrent_processes_rotate_without_losing_records(tmp_path):
    context = multiprocessing.get_context("spawn")
    start_event = context.Event()
    processes = [
        context.Process(
            target=_write_rotating_logs,
            args=(str(tmp_path), worker_id, start_event),
        )
        for worker_id in range(3)
    ]
    try:
        for process in processes:
            process.start()
        start_event.set()
        for process in processes:
            process.join(timeout=30)
            assert process.exitcode == 0

        log_dir = tmp_path / "logs" / "backend"
        contents = "".join(
            path.read_text(encoding="utf-8")
            for path in log_dir.glob("mes.log*")
            if path.is_file()
        )
        for worker_id in range(3):
            for record_id in range(40):
                assert contents.count(f"worker-{worker_id}-record-{record_id} ") == 1
    finally:
        for process in processes:
            if process.is_alive():
                process.terminate()
        for process in processes:
            if process.pid is not None:
                process.join(timeout=5)
