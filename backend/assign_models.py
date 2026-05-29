"""[DEPRECATED — 2026-05-29 폐기]

기존 동작: legacy_model 키워드 매칭으로 ItemModel(item_id, slot) 다대다 행 생성.

폐기 이유:
- legacy_model 컬럼 이미 제거.
- 411개 item_models 가 비어있던 채로 '김민재 SOLO 필터' 실패 발생.
- 회사 규약상 item_code prefix(첫 '-' 앞 글자열)의 각 글자가 ProductSymbol.symbol 과
  1:1 대응 — 별도 매핑 테이블 불필요.
- ItemModel ORM 클래스 + item_models 테이블 폐기됨.

대체 경로:
- 응답 model_slots: `app.utils.item_code.item_code_to_model_slots(item.item_code)`
- 거래 모델 필터: `_model_filter(db, model)` (transactions.py) — prefix LIKE OR.
- 신규 품목 생성: AdminItemsSection 에서 model_slots 입력 → item_code 가
  prefix 를 가지면 자동 매핑.

이 파일은 실행되지 않는다 (import 즉시 SystemExit).
"""
import sys

sys.stderr.write(
    "assign_models.py is deprecated (2026-05-29). item_models is gone — "
    "model mapping is now derived from item_code prefix. See module docstring.\n"
)
sys.exit(1)
