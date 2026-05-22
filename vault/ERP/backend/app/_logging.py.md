---
type: file-explanation
source_path: "backend/app/_logging.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _logging.py — _logging.py 설명

## 이 파일은 무엇을 책임지나

`_logging.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/_logging.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `setup_logging`
- `get_logger`

## 연결되는 파일

- [[ERP/backend/app/📁_app]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""MES 백엔드 로깅 설정.

운영 표준:
- 콘솔 로그: 기존대로 (uvicorn access + 우리 INFO)
- 파일 로그: backend/logs/mes.log (RotatingFileHandler, 5MB x 5 backup)

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
```
