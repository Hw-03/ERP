---
type: code-note
project: ERP
layer: scripts
source_path: scripts/reapply_erp_codes.py
status: active
tags:
  - erp
  - scripts
  - erp-code
  - database
aliases:
  - ERP 코드 재부여 스크립트
---

# reapply_erp_codes.py

> [!summary] 역할
> 971개 품목에 **새 ERP 코드 체계(다중 모델 기호)**를 일괄 재부여하는 스크립트.
> 코드 체계 개편 후 기존 품목들을 새 규칙에 맞게 업데이트한다.

> [!info] 재부여 규칙
> - `legacy_model` 컬럼 기반으로 `model_symbol` 파생
> - `process_type_code` + `model_symbol` 조합으로 일련번호 1부터 재부여
> - "공용"/None 모델 품목 → `model_symbol=""` (NULL), `erp_code=NULL` 유지
> - `item_models` 조인 테이블에 `(item_id, slot)` 삽입

> [!info] 실행 모드
> | 명령 | 동작 |
> |------|------|
> | `python scripts/reapply_erp_codes.py` | dry-run (기본) |
> | `python scripts/reapply_erp_codes.py --apply` | 실제 DB 반영 |

---

## 쉬운 말로 설명

**기존 품목들의 ERP 코드(예: `3-AR-0001`)를 새 규칙으로 **전체 재발급**하는 스크립트**. 코드 체계가 바뀌어서 과거 코드가 더 이상 맞지 않을 때 한 번 실행.

언제 실행:
- 모델 기호 매핑이 추가/변경됨
- 공정 코드 체계가 개편됨
- 기존 품목 코드에 오류가 너무 많아 리셋 필요

## 재부여 로직

```
for each item:
  model_symbol = SLOT_TO_SYMBOL[item.legacy_model_slot] 또는 ""
  process = item.process_type_code
  serial = 해당 (model_symbol, process) 조합의 다음 시리얼 (1부터)
  item.erp_code = f"{model_symbol}-{process}-{serial:04d}"
  
  # 예시 (재발급 전후)
  # before: "LEGACY-00001"
  # after:  "3-AR-0001" (DX3000 + 조립공정 + 001)
```

## FAQ

**Q. 기존 이력의 품목 참조 깨지지 않나?**
`item_id` (PK) 는 유지되므로 참조 안 깨짐. `erp_code` 문자열만 바뀜. 다만 바코드/QR 발행물은 다시 출력 필요.

**Q. 공용 품목(모델 미지정)?**
`model_symbol=""` + `erp_code=NULL`. 굳이 코드 부여 안 함. 필요 시 관리자가 수동 지정.

**Q. 부분 재발급?**
현재 전체 대상만. 카테고리/부서 필터는 스크립트 수정 필요.

---

## 관련 문서

- [[backend/app/utils/erp_code.py.md]] — ERP 코드 생성 유틸
- [[backend/app/services/codes.py.md]] — 코드 서비스 레이어
- [[scripts/migrate_erp_schema.py.md]] — 스키마 마이그레이션 (선행 작업)
- 용어 사전 — ERP 코드 4파트 설명

Up: [[scripts/scripts]]
