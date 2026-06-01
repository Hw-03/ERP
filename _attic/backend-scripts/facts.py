#!/usr/bin/env python
"""현재 DB 사실(품목 수 등 변동값)을 출력하는 읽기 전용 점검 스크립트.

원칙: 문서에 변동 숫자를 박아두면 금방 낡는다. 변하는 숫자는 문서가 아니라
이 명령으로 확인한다. (DEXCOWIN MES — 기준정보 정합)

실행:
    python _attic/backend-scripts/facts.py
"""
import os
import sqlite3
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 한글 깨짐 방지 (py3.7+)
except Exception:
    pass

_HERE = os.path.dirname(os.path.abspath(__file__))
_CANDIDATES = [
    os.path.join(_HERE, "..", "..", "backend", "mes.db"),
    os.path.join(os.getcwd(), "mes.db"),
    os.path.join(os.getcwd(), "backend", "mes.db"),
]


def _find_db():
    for p in _CANDIDATES:
        if os.path.exists(p):
            return os.path.abspath(p)
    return None


def main():
    db = _find_db()
    if not db:
        print("mes.db 를 찾을 수 없습니다. backend/ 에서 실행하거나 경로를 확인하세요.")
        return 1
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    c = con.cursor()

    def one(q):
        return c.execute(q).fetchone()[0]

    print(f"DB: {db}")
    print("=== 현재 기준정보 사실 (이게 진실 — 문서보다 우선) ===")
    print("활성 품목 수        :", one("SELECT COUNT(*) FROM items WHERE deleted_at IS NULL"))
    print("삭제(숨김) 품목 수   :", one("SELECT COUNT(*) FROM items WHERE deleted_at IS NOT NULL"))
    print(
        "사용 중 공정코드 수  :",
        one("SELECT COUNT(DISTINCT process_type_code) FROM items WHERE process_type_code IS NOT NULL"),
        "/ 정의된 공정코드:",
        one("SELECT COUNT(*) FROM process_types"),
    )
    print("모델기호 종류 수     :", one("SELECT COUNT(DISTINCT model_symbol) FROM items WHERE model_symbol IS NOT NULL"))
    print("등록 모델 수         :", one("SELECT COUNT(*) FROM product_symbols WHERE symbol IS NOT NULL AND symbol!=''"))
    print(
        "부서 수             :",
        one("SELECT COUNT(*) FROM departments WHERE is_active=1"),
        "(활성) /",
        one("SELECT COUNT(*) FROM departments"),
        "(전체)",
    )
    print("직원 수             :", one("SELECT COUNT(*) FROM employees"))
    print("BOM 줄 수           :", one("SELECT COUNT(*) FROM bom"))
    print("거래기록 줄 수       :", one("SELECT COUNT(*) FROM transaction_logs"))
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
