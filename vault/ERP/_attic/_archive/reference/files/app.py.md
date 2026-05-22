---
type: file-explanation
source_path: "_attic/_archive/reference/files/app.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# app.py — app.py 설명

## 이 파일은 무엇을 책임지나

`app.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `get_file_path`
- `find_row_by_name`
- `find_date_col`
- `index`
- `ping`
- `get_stock`
- `get_all_stocks`
- `compare_stock`
- `process_io`

## 연결되는 파일

- [[ERP/_attic/_archive/reference/files/📁_files]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
덱스코윈 재고관리 Flask 서버
실행: python app.py
접속: http://[PC_IP]:5000
"""
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import openpyxl
from datetime import datetime, date
import threading
import os
import json

app = Flask(__name__)
CORS(app)

# ── 설정: 엑셀 파일 경로 ───────────────────────────────────────────
BASE_PATH = r"C:\Users\HW\Desktop\재고관리"

FILES = {
    "창고": "F704-03 (R00) 자재 재고 현황.xlsx",
    "조립": "2026.03_생산부 자재_조립,출하파트.xlsx",
    "고압": "2026.03_생산부 자재_고압,진공,튜닝파트.xlsx",
    "출하": "2026.03_출하_완제품.xlsx",
    "데모": "2026.03_데모장비및 테스트장비.xlsx",
}

FILE_CONFIG = {
    "창고": {
        "sheet_main": "26.03월",  # 매월 변경 필요
        "header_row": 3,
        "data_start": 4,
        "col_name":   4,   # D열
        "col_stock":  15,  # O열 (수식)
        "col_in":     16,  # P열
        "col_out":    32,  # AF열
        "type":       "direct",
    },
    "조립": {
        "sheet_main": "조립 자재",
        "sheet_in":   "입고내역",
        "sheet_out":  "출고내역",
        "header_row": 2,
        "data_start": 3,
        "col_name":   4,
        "col_stock":  9,
        "date_start": 6,
        "type":       "daily",
    },
    "고압": {
        "sheet_main": "고압",
        "sheet_in":   "입고내역",
        "sheet_out":  "출고내역",
        "header_row": 2,
        "data_start": 3,
```
