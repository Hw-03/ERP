---
type: file-explanation
source_path: "_attic/scripts/migrations/_archive/fix_legacy_items.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# fix_legacy_items.py — fix_legacy_items.py 설명

## 이 파일은 무엇을 책임지나

`fix_legacy_items.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
# -*- coding: utf-8 -*-
"""
1. inventory_locations.department 영문 → 한글 마이그레이션
2. 부서 미배정 품목 보완 (category 기반 자동 배정)
"""
import sqlite3, uuid
from datetime import datetime

DB_PATH = r"c:\ERP\backend\erp.db"

DEPT_MIGRATION = {
    "ASSEMBLY":      "조립",
    "HIGH_VOLTAGE":  "고압",
    "VACUUM":        "진공",
    "TUNING":        "튜닝",
    "TUBE":          "튜브",
    "SHIPPING":      "출하",
    "RESEARCH":      "연구",
    "SALES":         "영업",
    "ETC":           "기타",
    # AS는 그대로
}

# 카테고리 코드 → 부서
CATEGORY_TO_DEPT = {
    "TA": "튜브",  "TF": "튜브",  "TR": "튜브",
    "HA": "고압",  "HF": "고압",  "HR": "고압",
    "VA": "진공",  "VF": "진공",  "VR": "진공",
    "AA": "조립",  "AF": "조립",  "AR": "조립",
    "AA": "조립",  "PA": "출하",  "FG": "출하",
    "RM": "조립",  "UK": "조립",
}

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()

    # ── 1. 영문 → 한글 마이그레이션 ─────────────────────────
    print("=== 부서코드 마이그레이션 ===")
    total_updated = 0
    for eng, kor in DEPT_MIGRATION.items():
        cur.execute(
            "UPDATE inventory_locations SET department=? WHERE department=?",
            (kor, eng)
        )
        cnt = cur.rowcount
        if cnt > 0:
            print(f"  {eng} → {kor}: {cnt}건")
            total_updated += cnt
    print(f"마이그레이션 완료: {total_updated}건\n")

    # ── 2. 현황 확인 ─────────────────────────────────────────
    cur.execute("SELECT DISTINCT department FROM inventory_locations ORDER BY 1")
    print("현재 부서 값:", [r[0] for r in cur.fetchall()])
```
