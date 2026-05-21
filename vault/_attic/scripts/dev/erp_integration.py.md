---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/erp_integration.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# erp_integration.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/erp_integration.py]]

## 원본 첫 줄 (또는 메타)

```
"""
ERP 자재 마스터 DB 통합 스크립트
================================

정밀 X-ray 발생 장치 제조사의 4개 공정(튜브/고압/진공/조립) 엑셀 파일을 읽어
단일 표준 마스터 DB (`ERP_Master_DB.csv`)로 통합한다.

입력:
    - 파일 A: F704-03 (R00) 자재 재고 현황.xlsx       (원자재 마스터, Baseline)
    - 파일 B: 2026.03_생산부 자재_조립,출하파트.xlsx   (조립/출하 부서)
    - 파일 C: 2026.03_생산부 자재_고압,진공,튜닝파트.xlsx (고압/진공/튜닝 부서, 튜브 공정 자재 포함)

출력:
    - ERP_Master_DB.csv          : 통합 마스터 (items 테이블)
    - ERP_Source_Links.csv       : 소스-아이템 매핑 (링크 테이블)
    - ERP_Integration_Report.md  : 통합 결과 리포트 (카테고리 분포, 미매핑 리스트)
    - ERP_Excluded_Items.csv     : 비활성(구버전/미사용/사용중) 항목 분리

카테고리 코드:
    RM : 원자재         (파일 A & B/C 모두에 존재)
    AA : 조립 반제품    (파일 B 단독)
    AF : 조립 완제품    (파일 B 단독 & 모델명/ASS'Y 키워드)
    HA : 고압 반제품    (파일 C, 부서=고압)
    HF : 고압 완제품    (파일 C, 부서=고압 & ASS'Y 키워드)
    VA : 진공 반제품    (파일 C, 부서=진공/튜닝)
```
