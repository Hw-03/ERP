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
> ERP 구축과 운영 보조에 쓰는 원본 엑셀/CSV 자료 폴더.
> 코드보다 업무 원천 자료에 가깝기 때문에 직접 수정 여부를 항상 조심해서 봐야 한다.

## 현재 주요 파일

| 파일 | 의미 |
|---|---|
| `2026.03_생산부 자재_고압,진공,튜닝파트.xlsx` | 생산부 자재 원본 |
| `2026.03_생산부 자재_조립,출하파트.xlsx` | 조립/출하 파트 원본 |
| `F704-03 (R00) 자재 재고 현황.xlsx` | 재고 현황 기준표 |
| `개발현황.xlsx` | 개발 진행 참고 자료 |
| `재고_입력_양식.xlsx` | 재고 입력용 양식 |
| `ERP_Master_DB.csv` | 통합 결과 마스터 |
| `ERP_Source_Links.csv` | 원본 연결 정보 |
| `ERP_Excluded_Items.csv` | 제외 품목 목록 |
| `ERP_Unmatched_A_Items.csv` | 매칭 실패 품목 목록 |

## 읽는 포인트

- 운영 중인 진실의 원천은 DB이지만, 초기 이관과 검증은 여전히 이 자료들을 통해 추적한다.
- 데이터 파일 하나를 수정하는 것보다, 어떤 스크립트가 이 파일을 읽는지 함께 보는 게 중요하다.
- `개발현황.xlsx` 같은 파일은 코드가 아니라 맥락 전달용 자료다.

## 관련 문서

- [[scripts/scripts]]
- [[docs/README.md.md]]
- [[_vault/guides/처음_읽는_사람]]

Up: [[ERP]]

