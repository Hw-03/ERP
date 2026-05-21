---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/extract_excel_images.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# extract_excel_images.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/extract_excel_images.py]]

## 원본 첫 줄 (또는 메타)

```
"""생산부 자재 xlsx의 이미지 추출 + 품목 매칭 CSV 생성.

지원 시트(시트마다 컬럼 위치가 달라 SHEETS 테이블로 관리):
  - 고압        : 2026.05_생산부 자재_고압,진공,튜닝파트.xlsx
  - 조립 자재    : 2026.05_생산부 자재_조립,출하파트.xlsx
  - 튜브        : 2026.05_생산부 자재_튜브 파트.xlsx

산출:
  data/이미지 추출을 위한 원본/extracted/{시트명}/r{NNN}_{품목명}.{jpg|png}
  data/이미지 추출을 위한 원본/extracted/{시트명}/extracted_index.csv

화질 보존: openpyxl이 보관한 원본 바이트(img._data())를 그대로 write_bytes 한다. 재인코딩 없음.
WMF/EMF/WDP 등은 openpyxl이 지원하지 않아 자동으로 drop 됨 (경고로 표시).
"""
from __future__ import annotations

import csv
import re
import sys
import warnings
from collections import Counter
from pathlib import Path

import openpyxl

```
