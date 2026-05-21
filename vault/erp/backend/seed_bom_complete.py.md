---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/seed_bom_complete.py
tags: [vault, code-note, b-tier]
---

# seed_bom_complete.py — BOM 완성 보충 스크립트

> [!summary] 역할
> seed_bom.py로 생성된 BOM(~130개)을 유지하면서, F타입(?F) 완제품을 대응 상위 어셈블리에 연결해 제품 계층 완성.

## 1. 이 파일의 역할
- 기존 BOM 130개 유지 + AF/TF 등 F타입을 AA/TA 등과 매핑
- model_symbol 겹침으로 같은 제품군 판별 (예: AA "346", AF "34" → "3","4" 공통)
- load_existing() — DB의 기존 BOM 로드 (중복 방지 set)
- add_bom() — seed_bom.py와 동일 로직

## 2. 실제 원본 위치
`backend/seed_bom_complete.py` — 약 110줄

## 3. 주요 import
```python
from app.database import SessionLocal
from app.models import BOM, Item
import uuid
from decimal import Decimal
```

## 4. 어디서 쓰이는지
- bootstrap_db.py --seed 옵션 이후 (또는 수동 실행)
- seed_bom.py 다음에 실행 권장
- F타입 완제품 필터링이 필요한 라우터 (예: 완제품 조회)

## 5. ⚠️ 위험 포인트
- **symbols_overlap() 로직** — "346"과 "34"를 문자 집합으로 비교 (공통 기호 있으면 True). 오탐 가능
- load_existing()에서 이미 있는 BOM은 추가 안 함 — idempotent이지만 seed_bom 이후 기존 item 삭제 시 orphan 발생
- qty 고정 (1) — 실제 BOM은 부품 수량이 다양해야 함

## 6. 수정 전 체크
- seed_bom.py 이후 BOM 행 개수 확인 (~130개)
- seed_bom_complete.py 실행 후 AF/TF 연결 확인
- symbols_overlap("346", "34") → True 확인
