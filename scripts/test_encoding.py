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
