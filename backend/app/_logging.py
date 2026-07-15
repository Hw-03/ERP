"""MES 백엔드 로깅 설정.

운영 표준:
- 콘솔 로그: 기존대로 (uvicorn access + 우리 INFO)
- 파일 로그: _attic/runtime/logs/backend/mes.log (RotatingFileHandler, 5MB x 5 backup)

환경변수:
- LOG_LEVEL (기본 INFO)
- MES_RUNTIME_ROOT (기본 프로젝트/_attic/runtime)

main.py 가 startup 시 setup_logging() 한 번만 호출.
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend
_PROJECT_ROOT = _BACKEND_DIR.parent


def get_backend_log_dir() -> Path:
    """Return the fixed backend log directory under MES_RUNTIME_ROOT."""
    configured = os.environ.get("MES_RUNTIME_ROOT")
    runtime_root = Path(configured).expanduser() if configured else _PROJECT_ROOT / "_attic" / "runtime"
    if not runtime_root.is_absolute():
        runtime_root = _PROJECT_ROOT / runtime_root
    runtime_root = runtime_root.resolve()
    log_dir = (runtime_root / "logs" / "backend").resolve()
    try:
        log_dir.relative_to(runtime_root)
    except ValueError as exc:
        raise RuntimeError(f"runtime path is outside MES_RUNTIME_ROOT: {log_dir}") from exc
    return log_dir


def setup_logging() -> logging.Logger:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log_dir = get_backend_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)

    try:
        backup_count = int(os.environ.get("LOG_BACKUP_COUNT", "5"))
    except ValueError:
        backup_count = 5

    logger = logging.getLogger("mes")
    if getattr(logger, "_mes_configured", False):
        return logger

    logger.setLevel(level)

    fmt = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = RotatingFileHandler(
        log_dir / "mes.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)
    console_handler.setFormatter(fmt)
    logger.addHandler(console_handler)

    logger.propagate = False
    logger._mes_configured = True  # type: ignore[attr-defined]
    return logger


def get_logger() -> logging.Logger:
    return logging.getLogger("mes")
