---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/test_encoding.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# test_encoding.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/test_encoding.py]]

## 원본 첫 줄 (또는 메타)

```
# -*- coding: utf-8 -*-
import sqlite3, sys

print("Python encoding:", sys.getdefaultencoding())
print("File system encoding:", sys.getfilesystemencoding())

conn = sqlite3.connect(r"c:\ERP\backend\erp.db")
cur = conn.cursor()

cur.execute("PRAGMA encoding")
print("DB encoding:", cur.fetchone())

cur.execute("SELECT item_name FROM items LIMIT 3")
rows = cur.fetchall()
for r in rows:
    name = r[0]
    print("type:", type(name))
    print("repr:", repr(name[:20]))
    encoded = name.encode('utf-8') if isinstance(name, str) else name
    print("hex:", encoded[:20].hex())

# 레거시 hex in utf-8: eb a0 88 ea b1 b0 ec 8b 9c
target_hex = bytes.fromhex('eba088eab1b0ec8b9c')
print("target hex (레거시):", target_hex)

```
