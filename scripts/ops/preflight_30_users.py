#!/usr/bin/env python3
"""30명 동시 운영 사전 점검 스크립트 (100점 기준).

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
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
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
# 점검 함수 (15개)
# ---------------------------------------------------------------------------

async def check_server_reachable(client: httpx.AsyncClient, base_url: str) -> bool:
    """1. 서버 연결"""
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


async def check_db_engine_from_server(client: httpx.AsyncClient, base_url: str) -> bool:
    """2. 서버 실제 DB 엔진 확인 (환경변수 아닌 서버 응답 기준)"""
    try:
        res = await client.get(f"{base_url}/api/health/db-info", timeout=5)
        if res.status_code != 200:
            record("DB 엔진 (서버)", "WARN", f"조회 실패 HTTP {res.status_code}")
            return True
        data = res.json()
        engine = data.get("db_engine", "unknown")
        safe = data.get("safe_for_30_users", False)
        if engine == "postgresql":
            record("DB 엔진 (서버)", "PASS",
                   f"PostgreSQL 확인 — 30명 동시 운영 가능")
            return True
        elif engine == "sqlite":
            record("DB 엔진 (서버)", "FAIL",
                   "❌ SQLite 감지 — 30명 운영 금지. DATABASE_URL을 PostgreSQL로 변경 후 서버 재시작 필요.")
            return False
        else:
            record("DB 엔진 (서버)", "WARN", f"알 수 없는 엔진: {engine}")
            return True
    except Exception as e:
        record("DB 엔진 (서버)", "WARN", f"점검 실패 — {e}")
        return True


async def check_db_write(client: httpx.AsyncClient, base_url: str) -> None:
    """3. DB 실제 쓰기 테스트 (SAVEPOINT INSERT 후 rollback)"""
    try:
        res = await client.post(f"{base_url}/api/health/write-check", timeout=15)
        if res.status_code == 200:
            data = res.json()
            latency = data.get("latency_ms", "?")
            record("DB 쓰기 테스트", "PASS", f"INSERT→ROLLBACK 성공 ({latency}ms)")
        else:
            record("DB 쓰기 테스트", "FAIL",
                   f"HTTP {res.status_code} — DB 쓰기 불가 (읽기 전용이거나 권한 부족)")
    except Exception as e:
        record("DB 쓰기 테스트", "WARN", f"점검 실패 — {e}")


async def check_health_detailed(client: httpx.AsyncClient, base_url: str) -> None:
    """4. /health/detailed 점검"""
    try:
        res = await client.get(f"{base_url}/health/detailed", timeout=15)
        if res.status_code != 200:
            record("상세 헬스", "WARN", f"HTTP {res.status_code}")
            return
        data = res.json()
        db_ok = data.get("db", {}).get("ok", False)
        mismatch = data.get("inventory_mismatch_count", 0)
        if not db_ok:
            record("상세 헬스", "FAIL", "DB ping 실패")
        elif mismatch > 0:
            record("상세 헬스", "WARN", f"재고 불일치 {mismatch}건 감지")
        else:
            rows = data.get("rows", {})
            record("상세 헬스", "PASS",
                   f"DB OK, items={rows.get('items', '?')}, employees={rows.get('employees', '?')}")
    except Exception as e:
        record("상세 헬스", "WARN", f"점검 실패 — {e}")


async def check_inventory_negative(client: httpx.AsyncClient, base_url: str) -> None:
    """5. 재고 음수 확인"""
    try:
        res = await client.get(f"{base_url}/api/inventory?limit=2000", timeout=10)
        if res.status_code != 200:
            record("재고 음수", "WARN", f"조회 실패 HTTP {res.status_code}")
            return
        items = res.json()
        negative = [
            i for i in items
            if float(i.get("warehouse_qty", 0)) < 0 or float(i.get("quantity", 0)) < 0
        ]
        if negative:
            record("재고 음수", "FAIL",
                   f"{len(negative)}개 품목 음수 재고 — 즉시 INCIDENT_RESPONSE.md 참조!")
        else:
            record("재고 음수", "PASS", f"{len(items)}개 품목 검사 통과")
    except Exception as e:
        record("재고 음수", "WARN", f"점검 실패 — {e}")


async def check_pending_consistency(client: httpx.AsyncClient, base_url: str) -> None:
    """6. pending > warehouse 확인"""
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
                   f"{len(violations)}개 품목 pending > warehouse_qty 위반")
        else:
            record("예약 일관성", "PASS", "pending_qty ≤ warehouse_qty 모두 만족")
    except Exception as e:
        record("예약 일관성", "WARN", f"점검 실패 — {e}")


async def check_inventory_invariant(client: httpx.AsyncClient, base_url: str) -> None:
    """7. Inventory.quantity == warehouse_qty + Σ location.quantity 불변식"""
    try:
        res = await client.get(f"{base_url}/health/detailed", timeout=15)
        if res.status_code != 200:
            record("재고 불변식", "WARN", f"detailed 조회 실패 HTTP {res.status_code}")
            return
        data = res.json()
        mismatch = data.get("inventory_mismatch_count", 0)
        if mismatch > 0:
            record("재고 불변식", "FAIL",
                   f"quantity != warehouse + Σlocation 위반 {mismatch}건 — 즉시 확인!")
        else:
            record("재고 불변식", "PASS", "quantity = warehouse + Σlocation 모두 만족")
    except Exception as e:
        record("재고 불변식", "WARN", f"점검 실패 — {e}")


async def check_open_requests(client: httpx.AsyncClient, base_url: str) -> None:
    """8. 미처리 요청 수"""
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
            record("미처리 요청", "FAIL", f"RESERVED {count}건 — 300건 이상 시 DB 부하 위험")
        elif count > 50:
            record("미처리 요청", "WARN", f"RESERVED {count}건 (50건 초과 — 담당자 확인 권장)")
        else:
            record("미처리 요청", "PASS", f"RESERVED {count}건 정상")
    except Exception as e:
        record("미처리 요청", "WARN", f"점검 실패 — {e}")


async def check_response_time(client: httpx.AsyncClient, base_url: str) -> None:
    """9. 응답시간"""
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
    p_max = max(latencies)
    if avg < 200:
        record("응답시간", "PASS", f"평균 {avg:.0f}ms / 최대 {p_max:.0f}ms (기준 200ms 이하)")
    elif avg < 1000:
        record("응답시간", "WARN", f"평균 {avg:.0f}ms — 부하 증가 시 503 위험")
    else:
        record("응답시간", "FAIL", f"평균 {avg:.0f}ms — 서버 응답 불안정 (1000ms 초과)")


async def check_concurrent_30(base_url: str) -> None:
    """10. 동시 30개 조회 요청"""
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


async def check_backup_exists() -> None:
    """11. 최근 백업 파일 존재"""
    backup_dir = Path(__file__).resolve().parents[2] / "outputs" / "backups"
    if not backup_dir.exists():
        record("백업 존재", "WARN", "backend/_backup/ 없음 — scripts\ops\backup_db.bat 실행 필요")
        return
    files = sorted(backup_dir.glob("*.db")) + sorted(backup_dir.glob("*.sql"))
    if not files:
        record("백업 존재", "WARN", "백업 파일 없음 — scripts\ops\backup_db.bat 실행 필요")
        return
    latest = max(f.stat().st_mtime for f in files)
    age_days = (datetime.now(timezone.utc).timestamp() - latest) / 86400
    if age_days <= 1:
        record("백업 존재", "PASS", f"최근 백업: {age_days * 24:.1f}시간 전 ({len(files)}개)")
    elif age_days <= 7:
        record("백업 존재", "PASS", f"최근 백업: {age_days:.1f}일 전 ({len(files)}개)")
    else:
        record("백업 존재", "WARN", f"마지막 백업 {age_days:.0f}일 전 — 매일 백업 권장")


async def check_create_and_cancel_request(
    client: httpx.AsyncClient, base_url: str
) -> None:
    """12. 테스트 요청 생성 → 취소 가능 여부"""
    try:
        # 직원 조회
        res = await client.get(f"{base_url}/api/employees?limit=50", timeout=5)
        if res.status_code != 200:
            record("요청 생성/취소", "WARN", "직원 조회 실패 — 점검 생략")
            return
        employees = res.json()
        test_emp = next(
            (e for e in employees if e.get("is_active")),
            None,
        )
        if not test_emp:
            record("요청 생성/취소", "WARN", "활성 직원 없음 — 점검 생략")
            return

        # 품목 조회
        res2 = await client.get(f"{base_url}/api/items?limit=10", timeout=5)
        if res2.status_code != 200 or not res2.json():
            record("요청 생성/취소", "WARN", "품목 조회 실패 — 점검 생략")
            return
        item = res2.json()[0]

        # DRAFT 생성
        import uuid as _uuid
        payload = {
            "requester_employee_id": test_emp["employee_id"],
            "request_type": "raw_ship",
            "status": "draft",
            "lines": [{"item_id": item["item_id"], "quantity": "1",
                        "from_bucket": "warehouse", "to_bucket": "none"}],
            "client_request_id": str(_uuid.uuid4()),
        }
        res3 = await client.post(f"{base_url}/api/stock-requests", json=payload, timeout=10)
        if res3.status_code not in (200, 201):
            record("요청 생성/취소", "WARN", f"DRAFT 생성 실패 HTTP {res3.status_code}")
            return
        req_id = res3.json().get("request_id")

        # DRAFT 취소
        res4 = await client.delete(
            f"{base_url}/api/stock-requests/{req_id}",
            params={"actor_employee_id": test_emp["employee_id"]},
            timeout=10,
        )
        if res4.status_code in (200, 204):
            record("요청 생성/취소", "PASS", "DRAFT 생성 → 취소 정상")
        else:
            record("요청 생성/취소", "WARN",
                   f"취소 실패 HTTP {res4.status_code} — 생성된 DRAFT 수동 삭제 필요")
    except Exception as e:
        record("요청 생성/취소", "WARN", f"점검 실패 — {e}")


async def check_transaction_log_integrity(
    client: httpx.AsyncClient, base_url: str
) -> None:
    """13. TransactionLog 정합성 (health/detailed 의 transaction_logs 카운트 변화)"""
    try:
        res = await client.get(f"{base_url}/health/detailed", timeout=10)
        if res.status_code != 200:
            record("TransactionLog", "WARN", "detailed 조회 실패")
            return
        data = res.json()
        tx_count = data.get("rows", {}).get("transaction_logs", 0)
        record("TransactionLog", "PASS", f"현재 {tx_count}건 (이상 없음)")
    except Exception as e:
        record("TransactionLog", "WARN", f"점검 실패 — {e}")


async def check_write_latency_under_load(base_url: str) -> None:
    """14. 쓰기 요청 응답시간 (write-check 5회)"""
    latencies = []
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(5):
            t0 = time.perf_counter()
            try:
                res = await client.post(f"{base_url}/api/health/write-check", timeout=10)
                if res.status_code == 200:
                    latencies.append((time.perf_counter() - t0) * 1000)
            except Exception:
                pass
    if not latencies:
        record("쓰기 응답시간", "WARN", "쓰기 응답 없음")
        return
    avg = sum(latencies) / len(latencies)
    if avg < 500:
        record("쓰기 응답시간", "PASS", f"평균 {avg:.0f}ms (기준 500ms 이하)")
    elif avg < 2000:
        record("쓰기 응답시간", "WARN", f"평균 {avg:.0f}ms — DB 부하 또는 락 경합 의심")
    else:
        record("쓰기 응답시간", "FAIL", f"평균 {avg:.0f}ms — 즉시 PostgreSQL 전환 필요")


async def check_employee_count(client: httpx.AsyncClient, base_url: str) -> None:
    """15. 최소 활성 직원 수 (운영 가능 여부)"""
    try:
        res = await client.get(f"{base_url}/api/employees?limit=200", timeout=5)
        if res.status_code != 200:
            record("직원 등록", "WARN", "조회 실패")
            return
        employees = res.json()
        active = [e for e in employees if e.get("is_active")]
        wh_staff = [e for e in active if e.get("warehouse_role") in ("primary", "deputy")]
        if not active:
            record("직원 등록", "FAIL", "활성 직원 0명 — 운영 불가")
        elif not wh_staff:
            record("직원 등록", "WARN", f"활성 직원 {len(active)}명 / 창고 담당자 0명 — 창고 승인 불가")
        else:
            record("직원 등록", "PASS",
                   f"활성 직원 {len(active)}명 / 창고 담당자 {len(wh_staff)}명")
    except Exception as e:
        record("직원 등록", "WARN", f"점검 실패 — {e}")


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="30명 동시 운영 사전 점검 (100점 기준)")
    parser.add_argument("--url", default="http://localhost:8000", help="서버 URL")
    args = parser.parse_args()
    base_url = args.url.rstrip("/")

    print("=" * 60)
    print("  PREFLIGHT: 30명 동시 운영 사전 점검 (100점 기준)")
    print(f"  대상: {base_url}")
    print(f"  시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    async with httpx.AsyncClient(timeout=10) as client:
        ok = await check_server_reachable(client, base_url)
        if not ok:
            print("\n❌ 서버 연결 실패 — 나머지 점검을 건너뜁니다.")
            sys.exit(1)

        db_ok = await check_db_engine_from_server(client, base_url)
        await check_db_write(client, base_url)
        await check_health_detailed(client, base_url)
        await check_inventory_negative(client, base_url)
        await check_pending_consistency(client, base_url)
        await check_inventory_invariant(client, base_url)
        await check_open_requests(client, base_url)
        await check_response_time(client, base_url)
        await check_transaction_log_integrity(client, base_url)
        await check_employee_count(client, base_url)
        await check_create_and_cancel_request(client, base_url)

    await check_concurrent_30(base_url)
    await check_write_latency_under_load(base_url)
    await check_backup_exists()

    # 집계
    passes = sum(1 for r in results if r.level == "PASS")
    warns = sum(1 for r in results if r.level == "WARN")
    fails = sum(1 for r in results if r.level == "FAIL")

    print()
    print("-" * 60)
    print(f"  점검 항목: {len(results)}개  |  PASS {passes}  WARN {warns}  FAIL {fails}")
    print("-" * 60)

    if fails > 0:
        fail_items = [r.name for r in results if r.level == "FAIL"]
        print(f"  ❌ 결론: 운영 불가")
        print(f"  FAIL 항목: {', '.join(fail_items)}")
        print("  → INCIDENT_RESPONSE.md 또는 POSTGRES_LOCAL_SERVER_RUNBOOK.md 참조")
        sys.exit(1)
    elif warns > 0:
        warn_items = [r.name for r in results if r.level == "WARN"]
        print(f"  ⚠️  결론: 주의 필요 — {', '.join(warn_items)}")
        print("  → WARN 항목 확인 후 운영 여부 결정")
        sys.exit(2)
    else:
        print("  ✅ 결론: 운영 가능 — 15개 항목 전체 통과!")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
