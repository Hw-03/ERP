---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/_archive/reference/files/app.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# app.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/_archive/reference/files/app.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
