---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/utils/item_code.py
tags: [vault, code-note, b-tier]
---

# item_code.py — 4파트 품목코드 생성 유틸리티

> [!summary] 역할
> 품목코드 형식 생성 및 serial_no 채번. 형식: {model_symbol}-{process_type}-{serial:04d}[-{option}]

## 1. 이 파일의 역할
- SLOT_TO_SYMBOL: 제품 슬롯(1-5) → 기호 매핑 (3/7/8/4/6)
- slots_to_model_symbol() — 슬롯 목록 → 정렬된 기호 문자열 (예: [1,4,5] → "346")
- make_item_code() — 4파트 문자열 생성
- next_serial_no() — process_type 카테고리 내 최대 serial_no + 1 조회

## 2. 실제 원본 위치
`backend/app/utils/item_code.py` — 약 60줄

## 3. 주요 import
```python
from sqlalchemy import func
from sqlalchemy.orm import Session
```
- DB 쿼리로 max(serial_no) 조회

## 4. 어디서 쓰이는지
- Item 생성 엔드포인트 — 신규 품목 코드 자동 채번
- bootstrap_db.py — 초기 품목 마이그레이션 시
- BOM 생성 시 부모/자식 품목 식별에 간접 사용

## 5. ⚠️ 위험 포인트
- **next_serial_no는 process_type 카테고리 전역 스코프** — 모델 무관 일련번호. 같은 공정에서 3-AR-0001, 4-AR-0002처럼 모델이 달라도 겹치지 않음 (설계 의도)
- Race condition: 동시에 next_serial_no() 호출 시 같은 번호 반환 가능 → DB 제약(UNIQUE) 의존
- SLOT_TO_SYMBOL에 없는 슬롯 입력 시 KeyError → 호출처에서 validation 필수

## 6. 수정 전 체크
- make_item_code("3", "AR", 1, "BG") → "3-AR-0001-BG" 확인
- slots_to_model_symbol([1, 4, 5]) → "346" (정렬된 상태) 확인
- next_serial_no(db_session) 호출 후 동일 호출 → 1씩 증가 확인
