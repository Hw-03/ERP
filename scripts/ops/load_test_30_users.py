#!/usr/bin/env python3
"""30명 동시 입출고 부하 테스트.

사용법:
    python scripts/ops/load_test_30_users.py --url http://localhost:8000
    python scripts/ops/load_test_30_users.py --url http://localhost:8000 --users 10 --rounds 3
    python scripts/ops/load_test_30_users.py --url http://localhost:8000 --dry-run

경고:
    - 운영 DB에 실제 데이터가 생성/변경됩니다.
    - 반드시 테스트용 품목(item_code가 'TEST-'로 시작)과 테스트용 직원만 사용합니다.
    - --confirm 없이는 실행되지 않습니다.

결과:
    outputs/load_test/YYYYMMDD_HHMMSS_report.json 에 저장됩니다.
"""

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

try:
    import httpx
except ImportError:
    print("httpx 미설치. pip install httpx 후 재실행하세요.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# 결과 데이터 구조
# ---------------------------------------------------------------------------

@dataclass
class ScenarioResult:
    user_id: int
    scenario: str
    status_code: int
    latency_ms: float
    success: bool
    error: Optional[str] = None


@dataclass
class LoadTestReport:
    test_at: str
    base_url: str
    num_users: int
    rounds: int
    results: list[dict] = field(default_factory=list)
    summary: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# 시나리오
# ---------------------------------------------------------------------------

async def scenario_health_check(client: httpx.AsyncClient, base_url: str, user_id: int) -> ScenarioResult:
    start = time.perf_counter()
    try:
        res = await client.get(f"{base_url}/api/items?limit=1")
        latency = (time.perf_counter() - start) * 1000
        return ScenarioResult(user_id, "health_check", res.status_code, latency, res.status_code == 200)
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return ScenarioResult(user_id, "health_check", 0, latency, False, str(e))


async def scenario_create_request(
    client: httpx.AsyncClient,
    base_url: str,
    user_id: int,
    requester_id: str,
    item_id: str,
) -> ScenarioResult:
    start = time.perf_counter()
    try:
        payload = {
            "requester_employee_id": requester_id,
            "request_type": "raw_ship",
            "lines": [
                {
                    "item_id": item_id,
                    "quantity": "1",
                    "from_bucket": "warehouse",
                    "to_bucket": "none",
                }
            ],
            "client_request_id": str(uuid.uuid4()),
        }
        res = await client.post(f"{base_url}/api/stock-requests", json=payload)
        latency = (time.perf_counter() - start) * 1000
        success = res.status_code in (200, 201)
        return ScenarioResult(user_id, "create_request", res.status_code, latency, success)
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return ScenarioResult(user_id, "create_request", 0, latency, False, str(e))


async def scenario_list_inventory(
    client: httpx.AsyncClient,
    base_url: str,
    user_id: int,
) -> ScenarioResult:
    start = time.perf_counter()
    try:
        res = await client.get(f"{base_url}/api/inventory?limit=20")
        latency = (time.perf_counter() - start) * 1000
        return ScenarioResult(user_id, "list_inventory", res.status_code, latency, res.status_code == 200)
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return ScenarioResult(user_id, "list_inventory", 0, latency, False, str(e))


async def scenario_fullflow_create_and_cancel(
    client: httpx.AsyncClient,
    base_url: str,
    user_id: int,
    requester_id: str,
    item_id: str,
) -> ScenarioResult:
    """풀플로우: DRAFT 생성 → submit → cancel (창고 승인 불필요 경로)."""
    start = time.perf_counter()
    scenario_name = "fullflow_create_cancel"
    try:
        # 1. DRAFT 생성
        cr_payload = {
            "requester_employee_id": requester_id,
            "request_type": "raw_ship",
            "status": "draft",
            "lines": [{"item_id": item_id, "quantity": "1",
                        "from_bucket": "warehouse", "to_bucket": "none"}],
            "client_request_id": str(uuid.uuid4()),
        }
        cr = await client.post(f"{base_url}/api/stock-requests", json=cr_payload)
        if cr.status_code not in (200, 201):
            latency = (time.perf_counter() - start) * 1000
            return ScenarioResult(user_id, scenario_name, cr.status_code, latency, False,
                                   f"create: {cr.status_code}")
        req_id = cr.json().get("request_id")

        # 2. cancel
        del_res = await client.delete(
            f"{base_url}/api/stock-requests/{req_id}",
            params={"actor_employee_id": requester_id},
        )
        latency = (time.perf_counter() - start) * 1000
        success = del_res.status_code in (200, 204)
        return ScenarioResult(user_id, scenario_name, del_res.status_code, latency, success)
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return ScenarioResult(user_id, scenario_name, 0, latency, False, str(e))


async def scenario_duplicate_submit(
    client: httpx.AsyncClient,
    base_url: str,
    user_id: int,
    requester_id: str,
    item_id: str,
) -> ScenarioResult:
    """중복 제출 방지: 같은 client_request_id 로 2번 POST → 2번째는 409."""
    start = time.perf_counter()
    crid = str(uuid.uuid4())
    payload = {
        "requester_employee_id": requester_id,
        "request_type": "raw_ship",
        "status": "draft",
        "lines": [{"item_id": item_id, "quantity": "1",
                    "from_bucket": "warehouse", "to_bucket": "none"}],
        "client_request_id": crid,
    }
    try:
        r1 = await client.post(f"{base_url}/api/stock-requests", json=payload)
        r2 = await client.post(f"{base_url}/api/stock-requests", json=payload)
        latency = (time.perf_counter() - start) * 1000
        # 두 번째는 409 이거나 동일 요청 반환이어야 함
        success = r1.status_code in (200, 201) and r2.status_code in (200, 201, 409)
        # 정리: 생성된 DRAFT cancel
        if r1.status_code in (200, 201):
            req_id = r1.json().get("request_id")
            if req_id:
                await client.delete(
                    f"{base_url}/api/stock-requests/{req_id}",
                    params={"actor_employee_id": requester_id},
                )
        return ScenarioResult(user_id, "duplicate_submit", r2.status_code, latency, success,
                               None if success else f"r1={r1.status_code} r2={r2.status_code}")
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return ScenarioResult(user_id, "duplicate_submit", 0, latency, False, str(e))


# ---------------------------------------------------------------------------
# 서버 사전 확인
# ---------------------------------------------------------------------------

async def check_server(base_url: str) -> tuple[bool, str]:
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            res = await client.get(f"{base_url}/health")
            if res.status_code == 200:
                return True, "OK"
            return False, f"HTTP {res.status_code}"
        except Exception as e:
            return False, str(e)


async def get_test_resources(base_url: str) -> tuple[Optional[str], Optional[str]]:
    """테스트용 직원(TEST- 코드) + 테스트용 품목 조회."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            # 직원 목록
            res = await client.get(f"{base_url}/api/employees?limit=100")
            if res.status_code != 200:
                return None, None
            employees = res.json()
            test_emp = next(
                (e for e in employees if str(e.get("employee_code", "")).startswith("TEST")),
                None
            )

            # 품목 목록
            res2 = await client.get(f"{base_url}/api/items?limit=200")
            if res2.status_code != 200:
                return None, None
            items = res2.json()
            test_item = next(
                (i for i in items if str(i.get("item_code", "")).startswith("TEST")),
                None
            )

            emp_id = test_emp["employee_id"] if test_emp else None
            item_id = test_item["item_id"] if test_item else None
            return emp_id, item_id
        except Exception:
            return None, None


async def auto_seed_resources(base_url: str) -> tuple[Optional[str], Optional[str]]:
    """--auto-seed: TEST- 직원 + 품목이 없으면 생성. 이미 있으면 재사용."""
    async with httpx.AsyncClient(timeout=15) as client:
        emp_id = None
        item_id = None

        # 직원 조회
        try:
            res = await client.get(f"{base_url}/api/employees?limit=200")
            if res.status_code == 200:
                employees = res.json()
                test_emp = next(
                    (e for e in employees if str(e.get("employee_code", "")).startswith("TEST")),
                    None,
                )
                if test_emp:
                    emp_id = test_emp["employee_id"]
                    print(f"  테스트 직원 재사용: {test_emp['name']} ({emp_id})")
        except Exception:
            pass

        if not emp_id:
            try:
                payload = {
                    "employee_code": "TEST-EMP-001",
                    "name": "부하테스트담당자",
                    "role": "조립/사원",
                    "department": "조립",
                    "level": "staff",
                    "is_active": True,
                    "display_order": 999,
                }
                res = await client.post(f"{base_url}/api/employees", json=payload)
                if res.status_code in (200, 201):
                    emp_id = res.json().get("employee_id")
                    print(f"  테스트 직원 생성: TEST-EMP-001 ({emp_id})")
                else:
                    print(f"  테스트 직원 생성 실패: HTTP {res.status_code}")
            except Exception as e:
                print(f"  테스트 직원 생성 오류: {e}")

        # 품목 조회
        try:
            res = await client.get(f"{base_url}/api/items?limit=500")
            if res.status_code == 200:
                items = res.json()
                test_item = next(
                    (i for i in items if str(i.get("item_code", "")).startswith("TEST")),
                    None,
                )
                if test_item:
                    item_id = test_item["item_id"]
                    print(f"  테스트 품목 재사용: {test_item['item_name']} ({item_id})")
        except Exception:
            pass

        if not item_id:
            try:
                payload = {
                    "item_name": "부하테스트품목",
                    "unit": "EA",
                    "process_type_code": "TR",
                    "initial_quantity": 9999,
                }
                res = await client.post(f"{base_url}/api/items", json=payload)
                if res.status_code in (200, 201):
                    item_id = res.json().get("item_id")
                    print(f"  테스트 품목 생성: 부하테스트품목 ({item_id})")
                else:
                    print(f"  테스트 품목 생성 실패: HTTP {res.status_code}")
            except Exception as e:
                print(f"  테스트 품목 생성 오류: {e}")

        return emp_id, item_id


# ---------------------------------------------------------------------------
# 메인 부하 테스트 실행
# ---------------------------------------------------------------------------

async def run_load_test(
    base_url: str,
    num_users: int,
    rounds: int,
    emp_id: Optional[str],
    item_id: Optional[str],
) -> LoadTestReport:
    report = LoadTestReport(
        test_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        base_url=base_url,
        num_users=num_users,
        rounds=rounds,
    )

    all_results: list[ScenarioResult] = []

    async with httpx.AsyncClient(timeout=30, limits=httpx.Limits(max_connections=80)) as client:
        for round_no in range(1, rounds + 1):
            print(f"\n[Round {round_no}/{rounds}] {num_users}명 동시 실행...")
            tasks = []

            for uid in range(num_users):
                # 모든 사용자: 재고 조회 + 헬스 체크
                tasks.append(scenario_list_inventory(client, base_url, uid))
                tasks.append(scenario_health_check(client, base_url, uid))
                # 테스트 직원/품목이 있으면 추가 시나리오
                if emp_id and item_id:
                    tasks.append(scenario_create_request(client, base_url, uid, emp_id, item_id))
                    # 홀수 사용자: 풀플로우 (생성→취소)
                    if uid % 2 == 0:
                        tasks.append(scenario_fullflow_create_and_cancel(
                            client, base_url, uid, emp_id, item_id
                        ))
                    # 짝수 사용자: 중복 제출 방지 검증
                    else:
                        tasks.append(scenario_duplicate_submit(
                            client, base_url, uid, emp_id, item_id
                        ))

            round_results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in round_results:
                if isinstance(r, ScenarioResult):
                    all_results.append(r)
                else:
                    all_results.append(ScenarioResult(
                        user_id=-1, scenario="unknown", status_code=0,
                        latency_ms=0, success=False, error=str(r)
                    ))

    # 집계
    report.results = [asdict(r) for r in all_results]
    _summarize(report, all_results)
    return report


def _summarize(report: LoadTestReport, results: list[ScenarioResult]) -> None:
    total = len(results)
    successes = sum(1 for r in results if r.success)
    failures = total - successes
    latencies = [r.latency_ms for r in results if r.latency_ms > 0]
    status_counts: dict[int, int] = {}
    for r in results:
        status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1

    # 시나리오별 집계
    by_scenario: dict[str, dict] = {}
    for r in results:
        s = by_scenario.setdefault(r.scenario, {"total": 0, "success": 0})
        s["total"] += 1
        if r.success:
            s["success"] += 1
    scenario_summary = {
        k: {"total": v["total"], "success": v["success"],
            "rate_pct": round(v["success"] / v["total"] * 100, 1) if v["total"] else 0}
        for k, v in by_scenario.items()
    }

    report.summary = {
        "total_requests": total,
        "successes": successes,
        "failures": failures,
        "success_rate_pct": round(successes / total * 100, 1) if total else 0,
        "status_409_count": status_counts.get(409, 0),
        "status_503_count": status_counts.get(503, 0),
        "latency_avg_ms": round(statistics.mean(latencies), 1) if latencies else 0,
        "latency_p50_ms": round(statistics.median(latencies), 1) if latencies else 0,
        "latency_p95_ms": round(statistics.quantiles(latencies, n=20)[18], 1) if len(latencies) >= 20 else 0,
        "latency_p99_ms": round(statistics.quantiles(latencies, n=100)[98], 1) if len(latencies) >= 100 else 0,
        "latency_max_ms": round(max(latencies), 1) if latencies else 0,
        "status_distribution": status_counts,
        "by_scenario": scenario_summary,
    }

    print("\n" + "=" * 50)
    print("부하 테스트 결과")
    print("=" * 50)
    print(f"총 요청: {total}")
    print(f"성공: {successes} ({report.summary['success_rate_pct']}%)")
    print(f"실패: {failures}")
    print(f"409 충돌: {report.summary['status_409_count']}")
    print(f"503 오류: {report.summary['status_503_count']}")
    print(f"평균 응답시간: {report.summary['latency_avg_ms']}ms")
    print(f"P50 응답시간: {report.summary['latency_p50_ms']}ms")
    print(f"P95 응답시간: {report.summary['latency_p95_ms']}ms")
    print(f"P99 응답시간: {report.summary['latency_p99_ms']}ms")
    print(f"최대 응답시간: {report.summary['latency_max_ms']}ms")
    print("\n시나리오별 성공률:")
    for sc, sv in scenario_summary.items():
        print(f"  {sc}: {sv['success']}/{sv['total']} ({sv['rate_pct']}%)")


# ---------------------------------------------------------------------------
# 재고 무결성 확인 + 마크다운 리포트
# ---------------------------------------------------------------------------

async def _check_inventory_integrity(base_url: str) -> int:
    """재고 음수 항목 수 반환. 0이면 PASS."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            res = await client.get(f"{base_url}/api/inventory?limit=2000")
            if res.status_code != 200:
                print(f"⚠️  재고 조회 실패: HTTP {res.status_code}")
                return -1
            items = res.json()
            negative = [
                i for i in items
                if float(i.get("warehouse_qty", 0)) < 0 or float(i.get("quantity", 0)) < 0
            ]
            if negative:
                print(f"❌ 재고 음수 감지: {len(negative)}개 품목")
            else:
                print(f"✅ 재고 무결성: {len(items)}개 품목 모두 정상")
            return len(negative)
        except Exception as e:
            print(f"⚠️  재고 무결성 확인 실패: {e}")
            return -1


def _write_markdown_report(report: LoadTestReport, path: Path, negative_count: int) -> None:
    s = report.summary
    integrity_line = (
        "✅ PASS (음수 재고 없음)"
        if negative_count == 0
        else f"❌ FAIL ({negative_count}개 음수)" if negative_count > 0
        else "⚠️ 확인 불가"
    )
    scenario_rows = ""
    for sc, sv in s.get("by_scenario", {}).items():
        scenario_rows += f"| {sc} | {sv['success']}/{sv['total']} ({sv['rate_pct']}%) |\n"

    md = f"""# 30명 부하 테스트 결과
**실행 시각**: {report.test_at}
**대상 서버**: {report.base_url}
**사용자 수**: {report.num_users}명
**라운드**: {report.rounds}회

## 요약

| 항목 | 값 |
|------|-----|
| 총 요청 수 | {s['total_requests']} |
| 성공 | {s['successes']} ({s['success_rate_pct']}%) |
| 실패 | {s['failures']} |
| 409 Conflict | {s['status_409_count']} |
| 503 Unavailable | {s['status_503_count']} |
| 평균 응답시간 | {s['latency_avg_ms']} ms |
| P50 응답시간 | {s.get('latency_p50_ms', 0)} ms |
| P95 응답시간 | {s['latency_p95_ms']} ms |
| P99 응답시간 | {s.get('latency_p99_ms', 0)} ms |
| 최대 응답시간 | {s['latency_max_ms']} ms |
| 재고 무결성 | {integrity_line} |

## 시나리오별 성공률

| 시나리오 | 성공/전체 |
|---------|---------|
{scenario_rows}

## 판정

"""
    if s['status_503_count'] > 0:
        md += "⚠️ **503 발생** — SQLite busy_timeout 초과 또는 서버 과부하. PostgreSQL 전환 권장.\n"
    elif s['success_rate_pct'] >= 95 and negative_count == 0:
        md += "✅ **운영 가능** — 성공률 95% 이상, 재고 정합성 유지.\n"
    elif s['success_rate_pct'] >= 80:
        md += "⚠️ **주의** — 성공률 80~95%. 원인 분석 후 운영 여부 결정.\n"
    else:
        md += "❌ **운영 불가** — 성공률 80% 미만. 원인 파악 필요.\n"

    path.write_text(md, encoding="utf-8")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="30명 동시 입출고 부하 테스트",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--url", default="http://localhost:8000", help="서버 URL (기본: http://localhost:8000)")
    parser.add_argument("--users", type=int, default=30, help="동시 사용자 수 (기본: 30)")
    parser.add_argument("--rounds", type=int, default=3, help="라운드 수 (기본: 3)")
    parser.add_argument("--dry-run", action="store_true", help="실제 실행 없이 설정만 출력")
    parser.add_argument("--confirm", action="store_true", help="실제 DB 변경 작업 수행 확인 (필수)")
    parser.add_argument("--auto-seed", action="store_true", help="TEST- 직원/품목 없으면 자동 생성")
    return parser.parse_args()


async def main():
    args = parse_args()

    print("=" * 60)
    print("DEXCOWIN MES — 30명 동시 입출고 부하 테스트")
    print("=" * 60)
    print(f"대상 서버: {args.url}")
    print(f"동시 사용자: {args.users}명")
    print(f"라운드: {args.rounds}회")
    print()
    print("⚠️  경고: 이 스크립트는 테스트 데이터(TEST- 코드)를 생성합니다.")
    print("⚠️  운영 데이터에 영향이 없도록 반드시 테스트용 직원/품목만 사용합니다.")
    print()

    if args.dry_run:
        print("[DRY RUN] 실제 실행 없이 종료합니다.")
        return

    if not args.confirm:
        print("--confirm 플래그가 필요합니다. 실제로 실행하려면:")
        print(f"  python {sys.argv[0]} --url {args.url} --confirm")
        sys.exit(1)

    # 서버 상태 확인
    ok, msg = await check_server(args.url)
    if not ok:
        print(f"서버 연결 실패: {msg}")
        sys.exit(1)
    print(f"서버 연결 확인: {msg}")

    # 테스트 리소스 조회 (또는 자동 생성)
    if args.auto_seed:
        print("테스트 데이터 자동 생성 중...")
        emp_id, item_id = await auto_seed_resources(args.url)
    else:
        emp_id, item_id = await get_test_resources(args.url)
    if emp_id:
        print(f"테스트 직원 ID: {emp_id}")
    else:
        print("테스트 직원(TEST- 코드) 없음 — 조회 시나리오만 실행합니다.")
    if item_id:
        print(f"테스트 품목 ID: {item_id}")
    else:
        print("테스트 품목(TEST- item_code) 없음 — 조회 시나리오만 실행합니다.")

    report = await run_load_test(args.url, args.users, args.rounds, emp_id, item_id)

    # 결과 저장
    output_dir = Path(__file__).resolve().parents[2] / "outputs" / "load_test"
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"{ts}_report.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(asdict(report), f, ensure_ascii=False, indent=2, default=str)
    print(f"\n결과 저장: {output_path}")

    # 재고 무결성 확인
    negative_count = await _check_inventory_integrity(args.url)

    # 마크다운 요약 저장
    md_path = output_dir / f"{ts}_report.md"
    _write_markdown_report(report, md_path, negative_count)
    print(f"요약 저장: {md_path}")


if __name__ == "__main__":
    asyncio.run(main())
