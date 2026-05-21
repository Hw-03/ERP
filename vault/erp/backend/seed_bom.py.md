---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/seed_bom.py
tags: [vault, code-note, b-tier]
---

# seed_bom.py — BOM 계층 생성 스크립트

> [!summary] 역할
> Level-1: AA 상위 10개 → TA/HA/VA/RM 자식 10개씩. Level-2: TA/HA/VA 중 6개 → RM 자식 5개씩 구성.

## 1. 이 파일의 역할
- R_TYPE_CODES: RM 원자재 6종 (TR/HR/VR/NR/AR/PR)
- add_bom() — 부모/자식 Item + 수량 → BOM 레코드 생성 (중복 방지)
- main() — 기존 Item 조회 후 계층 구조 자동 생성
- random.seed(42) — 재현성 있는 난수 생성

## 2. 실제 원본 위치
`backend/seed_bom.py` — 약 100줄

## 3. 주요 import
```python
from app.database import SessionLocal
from app.models import Item, BOM
import uuid, random
from decimal import Decimal
```

## 4. 어디서 쓰이는지
- bootstrap_db.py 의 seed 옵션 호출
- seed_bom_complete.py 실행 전 기본 BOM 구축
- 제품 계층 구조(조립 → 부품 → 원자재) 테스트 데이터 생성

## 5. ⚠️ 위험 포인트
- **AA(조립) 상위 10개만 선택** — 다른 공정의 상위 품목은 BOM 미생성. seed_bom_complete.py로 보완 필수
- random.seed(42) 고정 — 재현성은 있지만 운영 환경에서는 의미 없음
- Item이 충분히 없으면 예외 발생 (Item 생성 후 실행 필수)

## 6. 수정 전 체크
- Item 테이블에 AA/TA/HA/VA/R 타입 품목이 충분한지 확인
- python seed_bom.py 실행 후 BOM 행 개수 확인 (약 130개 기대)
- add_bom() 중복 방지 로직 테스트 (existing set 참고)
