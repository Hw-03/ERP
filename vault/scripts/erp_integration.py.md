---
type: code-note
project: ERP
layer: scripts
source_path: scripts/erp_integration.py
status: active
tags:
  - erp
  - scripts
  - data
  - excel
  - integration
aliases:
  - ERP 데이터 통합 스크립트
---

# erp_integration.py

> [!summary] 역할
> 부서별로 파편화된 **엑셀 파일 3종**을 읽어 단일 `ERP_Master_DB.csv` 로 통합하는 핵심 스크립트.
> 이 스크립트의 실행 결과가 ERP 시스템의 품목 마스터 데이터 원본이 된다.

> [!info] 입력 파일
> | 구분 | 파일 | 내용 |
> |------|------|------|
> | 파일 A | `F704-03 (R00) 자재 재고 현황.xlsx` | 원자재 마스터 (Baseline, 649행) |
> | 파일 B | `2026.03_생산부 자재_조립,출하파트.xlsx` | 조립/출하팀 자재 (515행) |
> | 파일 C | `2026.03_생산부 자재_고압,진공,튜닝파트.xlsx` | 고압/진공/튜닝팀 (164행) |

> [!info] 처리 단계
> 1. 각 엑셀에서 유효 행 로드
> 2. 파일 A 기준으로 B/C 매칭 (품명 유사도)
> 3. 카테고리 코드 부여 (RM/BA/BF/HA/VA/TA/TF/FG)
> 4. 비활성 항목 분리 (구버전/미사용/사용중 → `ERP_Excluded_Items.csv`)
> 5. 통합 마스터 출력 → `ERP_Master_DB.csv`

> [!info] 산출물
> - `data/ERP_Master_DB.csv` — 971개 품목 통합 마스터
> - `data/ERP_Source_Links.csv` — 원본 행 → 품목 매핑
> - `data/ERP_Excluded_Items.csv` — 비활성 항목 7개
> - `data/ERP_Unmatched_A_Items.csv` — 파일 A 미매핑 94개
> - `docs/CODEX_PROGRESS.md` — 최근 작업 기록

## 실행 방법

```bash
pip install pandas openpyxl
python scripts/erp_integration.py
```

---

## 쉬운 말로 설명

**부서별로 따로 쓰던 엑셀 3개를 하나의 CSV 로 합치는 전처리 스크립트**. ERP 시스템이 읽는 "품목 마스터" 데이터의 원본을 생성하는 가장 중요한 파일.

전형적 사용 시점:
- 최초 시스템 구축 시 (한 번)
- 부서 엑셀이 크게 바뀌어 재정비 필요할 때 (드묾)

일상적 운영에서는 재실행 X. 대신 한 번 만들어진 `ERP_Master_DB.csv` 를 `scripts/import_real_inventory.py` 또는 `backend/sync_excel_stock.py` 로 DB 에 주입.

## 내부 처리 의사코드

```
1. pandas.read_excel() × 3개 파일
2. 각 시트별 헤더 정규화 + 유효 행 필터링
3. 파일 A (자재 마스터) 를 기준으로
   for each row in A:
     - B/C 에서 품명 유사도 매칭 (fuzzywuzzy)
     - 매칭되면 부서/카테고리 부여
4. 카테고리 매핑:
   - 자재창고 → RM
   - 조립→BA/BF, 고압→HA/HF, 진공→VA/VF, 튜브→TA/TF, 출하→FG
5. 비활성(구버전/미사용/사용중) 행 → Excluded
6. 최종 DataFrame 3개 CSV 로 저장
```

## FAQ

**Q. 다시 실행하면 기존 DB 덮어쓰임?**
이 스크립트 자체는 CSV 만 생성. DB 에 반영은 별도 `scripts/import_real_inventory.py` 또는 `backend/sync_excel_stock.py` 호출 시.

**Q. 엑셀 헤더가 바뀌면?**
스크립트가 깨짐. 시트 구조 변경 시 해당 열명 하드코딩 부분(스크립트 내부) 수정 필요.

**Q. dry-run 모드?**
현재 없음. 항상 CSV 덮어씀. `data/` 폴더를 git 에 커밋해두면 diff 로 변화 확인 가능.

---

## 관련 문서

- [[data/data]] — 입력·출력 파일 목록
- [[docs/CODEX_PROGRESS.md.md]] — 최근 작업 기록
- [[backend/sync_excel_stock.py.md]] — DB 동기화 스크립트
- [[scripts/import_real_inventory.py.md]] — CSV → DB 주입 스크립트

Up: [[scripts/scripts]]
