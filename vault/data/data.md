---
type: index
project: ERP
layer: data
status: active
tags:
  - erp
  - data
aliases:
  - 데이터 파일 폴더
---

# data

> [!summary] 역할
> ERP 시스템의 원본 자재 데이터 파일(엑셀, CSV)이 있는 폴더.
> 이 파일들이 시스템의 품목 마스터 데이터 원본이다.

> [!warning] 주의
> - 이 파일들은 원본 자료이므로 직접 수정하지 말 것
> - `sync_excel_stock.py` 스크립트로 DB에 반영

## 파일 목록

| 파일 | 설명 |
|------|------|
| `2026.03_생산부 자재_고압,진공,튜닝파트.xlsx` | 고압·진공·튜닝 파트 자재 원본 |
| `2026.03_생산부 자재_조립,출하파트.xlsx` | 조립·출하 파트 자재 원본 |
| `F704-03 (R00) 자재 재고 현황.xlsx` | 재고 현황 원본 |
| `재고_입력_양식.xlsx` | 재고 입력 양식 |
| `ERP_Master_DB.csv` | 통합 마스터 DB |
| `ERP_Excluded_Items.csv` | 제외된 품목 목록 |
| `ERP_Unmatched_A_Items.csv` | 매칭 안 된 A 품목 |
| `ERP_Source_Links.csv` | 소스 연결 정보 |

---

## 쉬운 말로 설명

시스템 **원본 데이터** 보관 폴더. 현장에서 수기(엑셀)로 관리하던 자료를 시스템으로 옮기기 전 상태, 그리고 통합 결과물을 함께 보관.

### 파일 종류 3가지
1. **입력 원본** (xlsx) — 생산부 파트별, 재고 현황 양식
2. **통합 산출물** (csv) — 스크립트가 합쳐 만든 마스터 DB
3. **보조 자료** (csv) — 제외 품목, 매칭 실패 리스트, 소스 연결 정보

---

## 통합 흐름

```
[Excel 원본 3개]
    ↓ scripts/erp_integration.py
[ERP_Master_DB.csv + Excluded + Unmatched + Source_Links]
    ↓ scripts/import_real_inventory.py
[DB: items + inventory]
```

---

## FAQ

**Q. 엑셀 원본 수정해도 DB 에 바로 반영되나?**
아니다. 통합 스크립트 실행 후에만. 엑셀은 "원천 자료" 취급.

**Q. 시스템 운영 중에도 엑셀 관리 병행?**
운영 초기엔 병행 가능. 안정되면 DB 단일 기준으로 전환.

**Q. 매칭 실패 품목은 어떻게 처리?**
`ERP_Unmatched_A_Items.csv` 검토 → 수동 매핑 또는 새 품목 등록.

---

## 관련 문서

- [[scripts/scripts]] — 데이터 통합 스크립트
- [[docs/ERP_Integration_Report.md.md]] — 통합 결과 리포트
- [[docs/ERP_Mapping_Sample.md.md]] — 매핑 샘플
- 품목 등록 시나리오

Up: ERP MOC
