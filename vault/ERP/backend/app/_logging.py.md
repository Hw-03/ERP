---
layer: backend
---

# _logging.py — 로깅 설정

> [!summary] setup_logging(). 콘솔 + RotatingFileHandler(5MB x 5). LOG_LEVEL/LOG_DIR 환경변수

## 1. 역할
main.py startup에서 한 번 호출. 로거 "mes" 설정. INFO 기본. backend/logs/mes.log 파일 로그. 환경변수 LOG_LEVEL, LOG_DIR 지원.

## 2. 실제 원본 위치
erp/backend/app/_logging.py

## 3. 관련 형제 파일
- [[../../.env.example.md|환경변수 예시]]
- [[../main.py|메인 진입점]]
