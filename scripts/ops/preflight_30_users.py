#!/usr/bin/env python3
"""30명 동시 운영 사전 점검 스크립트.

사용법:
    python scripts/ops/preflight_30_users.py --url http://localhost:8000

각 점검 항목을 ✅ PASS / ⚠️  WARN / ❌ FAIL 로 출력하고,
마지막에 전체 판정을 보고합니다.

종료 코드:
    0 = 전체 PASS
    1 = FAIL 항목 있음
    2 = WARN만 있음 (FAIL 없음)
"""

import argparse
import asyncio
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Literal

try:
    import httpx
except ImportError:
    print("httpx 미설치: pip install httpx")
    sys.exit(1)


CheckLevel = Literal["PASS", "WARN", "FAIL"]


@dataclass
class CheckResult:
    name: str
    level: CheckLevel
    message: str


results: list[CheckResult] = []


def record(name: str, level: CheckLevel, message: str) -> None:
    icon = {"PASS": "✅", "WARN": "⚠️ ", "FAIL": "❌"}[level]
    print(f"  {icon} {name}: {message}")
    results.append(CheckResult(name, level, message))


# ---------------------------------------------------------------------------
# 점검 함수
# ---------------------------------------------------------------------------

async def check_server_reachable(client: httpx.AsyncClient, base_url: str) -> bool:
    try:
        res = await client.get(f"{base_url}/health", timeout=5)
        if res.status_code == 200:
            record("서버 연결", "PASS", f"HTTP {res.status_code} OK")
            return True
        record("서버 연결", "FAIL", f"HTTP {res.status_code}")
        return False
    except Exception as e:
        record("서버 연결", "FAIL", f"연결 실패 — {e}")
        return False


async def check_db_engine(base_url: str) -> None:
    db_url = os.environ.get("DATABASE_URL", "")
    if "postgresql" in db_url or "postgres" in db_url:
        record("DB 엔진", "PASS", "PostgreSQL 확인됨")
    elif "sqlite" in db_url.lower():
        record("DB 엔진", "FAIL",
               "SQLite 감지 — 30명 운영 부적합. DATABASE_URL을 PostgreSQL로 변경하세요.")
    else:
        # DATABASE_URL 미설정 → 백엔드 기본값(SQLite) 사용 가능성
        record("DB 엔진", "WARN",
               "DATABASE_URL 미설정 — SQLite(기본값) 가능성 있음. PostgreSQL 권장.")


async def check_inventory_negative(client: httpx.AsyncClient, base_url: str) -> None:
    try:
        res = await client.get(f"{base_url}/api/inventory?limit=2000", timeout=10)
        if res.status_code != 200:
            record("재고 음수 없음", "WARN", f"재고 조회 실패 HTTP {res.status_code}")
            return
        items = res.json()
        negative = [
            i for i in items
            if float(i.get("warehouse_qty", 0)) < 0
            or float(i.get("quantity", 0)) < 0
        ]
        if negative:
            record("재고 음수 없음", "FAIL",
                   f"{len(negative)}개 품목에서 음수 재고 감지 — 즉시 확인 필요!")
        else:
            record("재고 음수 없음", "PASS", f"총 {len(items)}개 품목 검사 통과")
    except Exception as e:
        record("재고 음수 없음", "WARN", f"검사 실패 — {e}")


async def check_pending_consistency(client: httpx.AsyncClient, base_url: str) -> None:
    try:
        res = await client.get(f"{base_url}/api/inventory?limit=2000", timeout=10)
        if res.status_code != 200:
            record("예약 일관성", "WARN", f"조회 실패 HTTP {res.status_code}")
            return
        items = res.json()
        violations = [
            i for i in items
            if float(i.get("pending_quantity", 0)) > float(i.get("warehouse_qty", 0))
        ]
        if violations:
            record("예약 일관성", "FAIL",
                   f"{len(violations)}개 품목에서 pending > warehouse_qty 위반")
        else:
            record("예약 일관성", "PASS", "pending_qty ≤ warehouse_qty 모두 만족")
    except Exception as e:
        record("예약 일관성", "WARN", f"검사 실패 — {e}")


async def check_open_requests(client: httpx.AsyncClient, base_url: str) -> None:
    try:
        res = await client.get(
            f"{base_url}/api/stock-requests?status=reserved&limit=300", timeout=10
        )
        if res.status_code != 200:
            record("미처리 요청", "WARN", f"조회 실패 HTTP {res.status_code}")
            return
        items = res.json()
        count = len(items)
        if count > 200:
            record("미처리 요청", "FAIL",
                   f"RESERVED 상태 요청 {count}건 — 300건 이상 쌓이면 DB 부하 위험")
        elif count > 50:
            record("미처리 요청", "WARN", f"RESERVED 상태 요청 {count}건 (50건 초과 주의)")
        else:
            record("미처리 요청", "PASS", f"RESERVED 요청 {count}건 (정상 범위)")
    except Exception as e:
        record("미처리 요청", "WARN", f"검사 실패 — {e}")


async def check_response_time(client: httpx.AsyncClient, base_url: str) -> None:
    latencies = []
    for _ in range(5):
        t0 = time.perf_counter()
        try:
            res = await client.get(f"{base_url}/api/items?limit=10", timeout=5)
            if res.status_code == 200:
                latencies.append((time.perf_counter() - t0) * 1000)
        except Exception:
            pass
    if not latencies:
        record("응답시간", "FAIL", "응답 없음")
        return
    avg = sum(latencies) / len(latencies)
    if avg < 200:
        record("응답시간", "PASS", f"평균 {avg:.0f}ms (기준 200ms 이하)")
    elif avg < 1000:
        record("응답시간", "WARN", f"평균 {avg:.0f}ms (200~1000ms — 부하 증가 시 503 위험)")
    else:
        record("응답시간", "FAIL", f"평균 {avg:.0f}ms (1000ms 초과 — 서버 응답 불안정)")


async def check_concurrent_30(base_url: str) -> None:
    async with httpx.AsyncClient(timeout=15, limits=httpx.Limits(max_connections=40)) as c:
        try:
            tasks = [c.get(f"{base_url}/api/inventory?limit=1") for _ in range(30)]
            responses = await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            record("동시 30요청", "FAIL", f"오류 — {e}")
            return

    ok = sum(1 for r in responses if isinstance(r, httpx.Response) and r.status_code == 200)
    err = 30 - ok
    if err == 0:
        record("동시 30요청", "PASS", "30/30 모두 HTTP 200 OK")
    elif err <= 2:
        record("동시 30요청", "WARN", f"{ok}/30 성공, {err}건 비200 — 부하 증가 시 503 가능")
    else:
        record("동시 30요청", "FAIL", f"{ok}/30 성공, {err}건 실패 — PostgreSQL 전환 필요")


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="30명 동시 운영 사전 점검")
    parser.add_argument("--url", default="http://localhost:8000", help="서버 URL")
    args = parser.parse_args()
    base_url = args.url.rstrip("/")

    print("=" * 56)
    print("  PREFLIGHT: 30명 동시 운영 사전 점검")
    print(f"  대상: {base_url}")
    print("=" * 56)

    async with httpx.AsyncClient(timeout=10) as client:
        ok = await check_server_reachable(client, base_url)
        if not ok:
            print("\n❌ 서버 연결 실패 — 나머지 점검을 건너뜁니다.")
            sys.exit(1)

        await check_db_engine(base_url)
        await check_inventory_negative(client, base_url)
        await check_pending_consistency(client, base_url)
        await check_open_requests(client, base_url)
        await check_response_time(client, base_url)

    await check_concurrent_30(base_url)

    # 집계
    passes = sum(1 for r in results if r.level == "PASS")
    warns = sum(1 for r in results if r.level == "WARN")
    fails = sum(1 for r in results if r.level == "FAIL")

    print()
    print("-" * 56)
    print(f"  결과: PASS {passes}  WARN {warns}  FAIL {fails}")
    print("-" * 56)

    if fails > 0:
        print("  ❌ 결론: 운영 불가 — FAIL 항목을 해결한 후 재실행하세요.")
        sys.exit(1)
    elif warns > 0:
        print("  ⚠️  결론: 주의 필요 — WARN 항목을 확인 후 운영하세요.")
        sys.exit(2)
    else:
        print("  ✅ 결론: 운영 가능 — 모든 점검 통과!")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
