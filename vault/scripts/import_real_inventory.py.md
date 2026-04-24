---
type: code-note
project: ERP
layer: scripts
source_path: scripts/import_real_inventory.py
status: active
tags:
  - erp
  - scripts
  - import
  - inventory
  - database
aliases:
  - 실제 재고 가져오기
---

# import_real_inventory.py

> [!summary] 역할
> `data/재고_입력_양식.xlsx` 파일을 읽어 `items` / `inventory` 테이블에 반영하는 스크립트.
> 기존 품목은 upsert, 없으면 신규 등록한다.

> [!info] 실행 모드
> | 명령 | 동작 |
> |------|------|
> | `py scripts/import_real_inventory.py` | **dry-run** — 추가/업데이트/스킵 건수만 출력 |
> | `py scripts/import_real_inventory.py --apply` | 실제 DB 반영 |
> | `py scripts/import_real_inventory.py --apply --wipe-existing` | 기존 데이터 전체 삭제 후 완전 교체 |

> [!warning] 주의
> `--wipe-existing` 옵션은 **되돌릴 수 없다**.
> 기존 971개 테스트 데이터가 모두 삭제되므로 반드시 백업 후 사용할 것.

---

## 쉬운 말로 설명

**담당자가 채운 재고 양식 엑셀을 DB 로 밀어넣는 스크립트**. 실수 방지를 위해 기본은 dry-run(미리보기만), `--apply` 붙여야 실제 저장.

권장 흐름:
1. `py scripts/import_real_inventory.py` → 변경 예정 건수 확인
2. 예상대로면 `--apply` 로 재실행
3. 전면 교체 시만 `--wipe-existing` (DB 백업 필수)

## Upsert 로직

```
for each 양식 row:
  if 품번 존재 and items 테이블에 있음:
    → UPDATE items.name/spec/...
    → UPDATE inventory.warehouse_qty/...
  elif 품번 없음 but 품명으로 매칭됨:
    → 경고 로그 (수동 확인 필요)
  else:
    → INSERT items (ERP 코드 자동 생성)
    → INSERT inventory
```

## FAQ

**Q. dry-run 인데 뭐가 바뀐다고 나옴?**
실제 바뀌진 않음. "이대로 실행하면 이렇게 바뀐다"는 예측만 표시.

**Q. `--apply` 중간 실패?**
트랜잭션 단위로 rollback. 부분 반영은 없음.

**Q. 부서별 버킷 수량도?**
현재 스크립트는 `warehouse_qty` 만. 부서 production 은 별도 API 호출로 반영해야 함.

**Q. 중복 품명?**
여러 행에 같은 품명 있으면 경고 + 스킵. 정확한 매칭은 품번(ERP 코드) 권장.

---

## 관련 문서

- [[scripts/generate_inventory_template.py.md]] — 입력 양식 생성
- [[backend/sync_excel_stock.py.md]] — 엑셀 → DB 동기화 (창고 재고 기준)
- [[backend/app/models.py.md]] — `Item`, `Inventory` 테이블

Up: [[scripts/scripts]]
