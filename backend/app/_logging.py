"""MES 백엔드 로깅 설정.

운영 표준:
- 콘솔 로그: 기존대로 (uvicorn access + 우리 INFO)
- 파일 로그: backend/logs/erp.log (RotatingFileHandler, 5MB x 5 backup)

환경변수:
- LOG_LEVEL (기본 INFO)
- LOG_DIR   (기본 backend/logs — 즉, 이 파일 기준 ../../logs)

main.py 가 startup 시 setup_logging() 한 번만 호출.
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend


def setup_logging() -> logging.Logger:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log_dir = Path(os.environ.get("LOG_DIR") or (_BACKEND_DIR / "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("erp")
    if getattr(logger, "_erp_configured", False):
        return logger

    logger.setLevel(level)

    fmt = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = RotatingFileHandler(
        log_dir / "erp.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
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
    logger._erp_configured = True  # type: ignore[attr-defined]
    return logger


def get_logger() -> logging.Logger:
    return logging.getLogger("erp")
