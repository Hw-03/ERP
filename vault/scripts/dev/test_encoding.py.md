---
type: code-note
project: ERP
layer: scripts
source_path: scripts/dev/test_encoding.py
status: active
updated: 2026-04-27
source_sha: d9c6ae483d94
tags:
  - erp
  - scripts
  - test
  - py
---

# test_encoding.py

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `scripts/dev/test_encoding.py`
- Layer: `scripts`
- Kind: `test`
- Size: `1026` bytes

## 연결

- Parent hub: [[scripts/dev/dev|scripts/dev]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

````python
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

conn.text_factory = bytes
cur2 = conn.cursor()
cur2.execute("SELECT item_name FROM items LIMIT 3")
for r in cur2.fetchall():
    raw = r[0]
    if target_hex in raw:
        print("FOUND 레거시 in raw bytes!")
    print("raw hex:", raw[:20].hex())

conn.close()
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
