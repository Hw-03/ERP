---
type: code-note
project: ERP
layer: backend
source_path: backend/app/_logging.py
status: active
updated: 2026-04-27
source_sha: 4c02b851036d
tags:
  - erp
  - backend
  - source-file
  - py
---

# _logging.py

> [!summary] 역할
> 원본 프로젝트의 `_logging.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/app/_logging.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `1790` bytes

## 연결

- Parent hub: [[backend/app/app|backend/app]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````python
"""ERP 백엔드 로깅 설정.

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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
