---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/bootstrap_db.py
tags: [vault, code-note, b-tier]
---

# bootstrap_db.py — DB 스키마/마이그레이션/시드 통합 CLI

> [!summary] 역할
> FastAPI 자동 시작 부작용을 분리. 스키마 생성, 마이그레이션, 참조 데이터 적재, 품목코드 백필을 명시적 CLI로 관리.

## 1. 이 파일의 역할
- --all: 스키마 + 마이그레이션 + 시드 + 품목코드 백필 일괄 실행
- --schema --migrate: DDL만 (개발 초기 세팅)
- --seed: 참조 데이터(Employee/ProductSymbol) 적재
- --item-code-backfill: NULL 품목코드 자동 채번
- --check: 실행 안 하고 DB 상태만 점검
- 모듈로도 import 가능 (bootstrap_all, run_schema_create_all 등)

## 2. 실제 원본 위치
`backend/bootstrap_db.py` — 약 200줄

## 3. 주요 import
```python
from sqlalchemy import text
from app.database import Base, SessionLocal, engine
from app.models import (
    Department, Employee, Item, OptionCode, ProcessFlowRule,
    ProcessType, ProductSymbol
)
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.utils.item_code import make_item_code
```

## 4. 어디서 쓰이는지
- CLAUDE.md: "python bootstrap_db.py --all" 권장 실행
- CI/CD 초기화 파이프라인 (GitHub Actions)
- 개발자 로컬 DB 초기 설정
- 운영 환경 마이그레이션 (새 컬럼/테이블 추가 시)

## 5. ⚠️ 위험 포인트
- **--all 실행 시 기존 데이터 보존 여부 확인** (DROP TABLE은 안 하지만 시드는 중복 추가 가능)
- 스키마 변경 후 실행 시 기존 행과 새 컬럼 호환성 확인 필수
- item-code-backfill은 매우 느릴 수 있음 (전체 Item 순회 + DB 업데이트)

## 6. 수정 전 체크
- python bootstrap_db.py --check: 0 오류 확인
- python bootstrap_db.py --all 후 Employee 26명 조회 확인
- python bootstrap_db.py --item-code-backfill 후 Item.item_code NULL 개수 0 확인
