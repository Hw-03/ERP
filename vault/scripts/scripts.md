---
type: index
project: ERP
layer: scripts
status: active
tags:
  - erp
  - scripts
  - utility
aliases:
  - 스크립트 폴더
---

# scripts/

> [!summary] 역할
> ERP 데이터 통합, DB 마이그레이션, 재고 관리 등 **일회성 또는 정기 실행 유틸 스크립트** 모음.
> 실제 서비스와는 별도로 관리자가 필요에 따라 실행한다.

> [!warning] 주의
> 대부분의 스크립트는 DB를 직접 수정한다.
> `--apply` 플래그가 없으면 dry-run(미리보기) 모드로 동작하는 것들이 있으니 반드시 확인할 것.

## 스크립트 목록

| 파일 | 설명 | 실행 방식 |
|------|------|-----------|
| [[scripts/erp_integration.py.md]] | 엑셀 3종 → ERP_Master_DB.csv 통합 | 직접 실행 |
| [[scripts/generate_inventory_template.py.md]] | 재고 입력용 엑셀 양식 생성 | 직접 실행 |
| [[scripts/import_real_inventory.py.md]] | 실제 재고 양식 → DB 반영 | `--apply` 플래그 필요 |
| [[scripts/migrate_erp_schema.py.md]] | DB 스키마 마이그레이션 | 직접 실행 |
| [[scripts/randomize_inventory.py.md]] | 테스트용 랜덤 재고 분배 | `--apply` 플래그 필요 |
| [[scripts/reapply_erp_codes.py.md]] | ERP 코드 일괄 재부여 | `--apply` 플래그 필요 |

---

## 쉬운 말로 설명

**일회성 유틸 스크립트** 모음. 시스템 운영 중에는 안 돌아가는 코드. 관리자가 필요할 때 수동 실행.

### 언제 실행?
- 처음 시스템 구축 시 (엑셀 → DB 최초 이관)
- DB 스키마 변경 시 (마이그레이션)
- 재고 일괄 재부여가 필요할 때 (ERP 코드 재계산)
- 테스트 환경 구축 시 (랜덤 시드)

---

## 실행 전 체크리스트

1. **DB 백업** — 실수 시 되돌릴 수 있도록 (SQLite는 `erp.db` 복사)
2. **dry-run 확인** — `--apply` 플래그 없이 먼저 실행해보기
3. **환경변수 확인** — 개발/운영 DB 잘못 지정하지 않았는지

---

## FAQ

**Q. 스크립트 돌리는 중 에러 나면?**
트랜잭션 사용 여부에 따라 다름. `--apply` 플래그 방식은 대체로 원자 처리(일부 반영 방지). 각 스크립트 개별 문서 확인.

**Q. 운영 서버에서 돌려도 되나?**
안전 스크립트는 OK. 데이터 변경 스크립트는 반드시 백업 후.

**Q. 새 스크립트 추가 위치는?**
`scripts/` 에 새 파일. `_index.md` 표에 등록. dry-run 지원 권장.

---

## 관련 문서

- [[data/data]] — 스크립트가 읽는 원본 파일
- [[backend/sync_excel_stock.py.md]] — 비슷한 용도 백엔드 스크립트
- [[backend/seed.py.md]] — 초기 데이터 시드

Up: ERP MOC
