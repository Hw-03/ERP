---
type: file-explanation
source_path: "_attic/scripts/dev/test_encoding.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_encoding.py — test_encoding.py 설명

## 이 파일은 무엇을 책임지나

`test_encoding.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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
```
