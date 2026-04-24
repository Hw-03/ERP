---
type: code-note
project: ERP
layer: backend
source_path: backend/sync_excel_stock.py
status: active
tags:
  - erp
  - backend
  - sync
  - excel
  - data
aliases:
  - 엑셀 재고 동기화 스크립트
---

# sync_excel_stock.py

> [!summary] 역할
> `data/` 폴더의 원본 엑셀 파일들과 `ERP_Master_DB.csv` 를 읽어서
> `backend/erp.db`의 `items` / `inventory` 테이블에 동기화하는 스크립트.

> [!info] 처리 흐름
> 1. `ERP_Master_DB.csv` 에서 품목 마스터 로드
> 2. 카테고리별로 대응 엑셀 파일·시트 결정
> 3. 엑셀에서 현재 재고 수량 추출
> 4. DB 품목과 매칭 → `inventory.warehouse_qty` 업데이트
> 5. 매칭 실패 품목은 로그로 기록

> [!info] 카테고리-파일 대응표
> | 카테고리 | 파일 유형 | 파트 |
> |----------|-----------|------|
> | RM | 원자재 | 자재창고 |
> | TA/TF | 조립자재 | 튜닝파트 |
> | HA/HF | 발생부자재 | 고압파트 |
> | VA/VF | 발생부자재 | 진공파트 |
> | BA/BF | 조립자재 | 조립출하 |
> | FG | 완제품 | 출하 |

> [!warning] 주의
> - 실행 전 `data/` 폴더의 엑셀 파일이 최신 상태인지 확인할 것
> - DB를 직접 수정하므로 적용 전 백업 권장

## 실행 방법

```bash
# 프로젝트 루트 또는 backend/ 에서 실행
python backend/sync_excel_stock.py
```

---

## 쉬운 말로 설명

**엑셀 파일 → DB 직결 동기화 스크립트**. `import_real_inventory.py` 는 "양식 엑셀 1개" 기준, 이건 "부서별 현황 엑셀 3개 + 통합 CSV" 기준.

용도 차이:
- `scripts/import_real_inventory.py` — 담당자가 수동 작성한 "양식" 기반
- `backend/sync_excel_stock.py` — 부서별 "자재 현황" 엑셀 직접 스캔 (자동 매칭)

## 매칭 실패 로그

- 품명 변경 / 오타로 DB 품목과 못 찾는 경우
- 카테고리 불일치 (엑셀엔 BA, DB엔 RM 등)
- `unmatched.log` 파일로 출력 → 운영자가 수동 보정

## FAQ

**Q. 엑셀 시트 이름 바뀌면?**
스크립트 내 시트명 하드코딩 부분 수정 필요. 부서별 파일/시트 대응표 참조.

**Q. 부서 production 버킷까지 동기화?**
현재는 `warehouse_qty` 만. 부서별 수치는 이력(inventory_histories)으로만 추적, 엑셀 원천 자료가 보통 통합 수치라 창고로 수렴.

---

## 관련 문서

- [[data/data]] — 원본 엑셀/CSV 파일 목록
- [[backend/app/utils/excel.py.md]] — 엑셀 파싱 유틸
- [[backend/app/routers/inventory.py.md]] — 재고 API
- [[scripts/erp_integration.py.md]] — 엑셀 통합 → `ERP_Master_DB.csv`

Up: [[backend/backend]]
