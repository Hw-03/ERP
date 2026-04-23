---
type: code-note
project: ERP
layer: docs
source_path: docs/ERP_Mapping_Sample.md
status: active
tags:
  - erp
  - docs
  - data
  - mapping
aliases:
  - 품목 매핑 샘플
---

# ERP_Mapping_Sample.md

> [!summary] 역할
> `erp_integration.py`의 매핑 로직이 올바르게 동작하는지 검증하기 위한 **30건 대표 샘플 문서**.
> 매핑 성공 20건 + Ass'y 단독 10건으로 구성되어 있다.

> [!info] 샘플 구성
> - 표준코드, 표준품명, 표준규격
> - 파일 A 이름 (원자재 마스터의 품명)
> - 파일 B/C 이름 (부서별 자재 목록의 품명)
> - 매핑 비고

> [!info] 샘플 예시
> | 표준코드 | 표준품명 | 파일 A | 파일 B/C |
> |---------|---------|--------|---------|
> | RM-000020 | TUBE 60KV D-081B | TUBE | 캐논튜브 [D-081B] _ 60KV |
> | RM-000030 | 고압 다이오드 2CL77 | 고압 다이오드 | 고압다이오드 2CL77 [20KV, 5mA] |

---

## 쉬운 말로 설명

**매핑 로직 검증용 "정답지"**. 자동 통합이 제대로 동작했는지 눈으로 확인하는 30건 샘플. 매핑 성공 20 + Assy 단독 10.

## 검증 방법

1. `erp_integration.py` 실행
2. 산출물 `ERP_Master_DB.csv` 에서 이 문서 표준코드 (`RM-000020` 등) 찾기
3. 매칭된 파일 B/C 이름이 이 문서 기대값과 같은지 비교
4. 다르면 매핑 로직에 버그 있을 가능성

## FAQ

**Q. 샘플 30건만으로 충분?**
전체 971건 대비 3% 샘플. 대표성 확보는 되지만 엣지 케이스는 별도 확인 필요.

**Q. 샘플 추가/교체?**
이 문서 수동 편집. 매핑 로직 변경 시 샘플도 같이 점검.

---

## 관련 문서

- [[scripts/erp_integration.py.md]] — 매핑 로직 구현
- [[docs/ERP_Integration_Report.md.md]] — 전체 통합 결과 리포트

Up: [[docs/docs]]
