---
type: file-explanation
source_path: "_attic/scripts/dev/erp_integration.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# erp_integration.py — erp_integration.py 설명

## 이 파일은 무엇을 책임지나

`erp_integration.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `norm_key`
- `clean_text`
- `std_name`
- `extract_spec_from_name`
- `load_file_a`
- `load_file_b`
- `load_file_c`
- `tokenize`
- `score_match`
- `build_bc_index`
- 그 외 8개 항목

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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
    VF : 진공 완제품    (파일 C, 부서=진공/튜닝 & ASS'Y 키워드)
    TA : 튜브 반제품    (파일 C, 분류=튜브* 또는 튜브 공정 부품 키워드)
    TF : 튜브 완제품    (파일 C, 분류=튜브/A,SSY 또는 튜브 어셈블리)
    FG : 최종 완제품    (회사 모델명과 동일)

비활성 부서(`구버전`/`미사용`/`사용중`)에 속한 파일 C 항목은 매칭에서 제외하고
ERP_Excluded_Items.csv 에 별도 보관한다 (감사용).

향후 SQL ERP 이관을 전제로 정규화된 스키마로 저장한다.
"""

from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# 경로 & 상수
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

FILE_A = DATA_DIR / "F704-03 (R00) 자재 재고 현황.xlsx"
```
