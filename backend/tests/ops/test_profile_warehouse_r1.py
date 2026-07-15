"""R1 쿼리 프로파일러가 격리된 runtime 보고서를 만드는지 검증한다."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = PROJECT_ROOT / "scripts" / "ops" / "profile_warehouse_r1.py"


def test_profile_warehouse_r1_writes_reproducible_json_under_runtime_root(tmp_path):
    runtime_root = tmp_path / "runtime"
    env = os.environ.copy()
    env["MES_RUNTIME_ROOT"] = str(runtime_root)

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--candidate-boxes",
            "120",
            "--noise-boxes",
            "480",
            "--repeats",
            "5",
        ],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    report_path = runtime_root / "reports" / "warehouse-r1-query-profile.json"
    assert report_path.is_file()

    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["fixture"] == {
        "candidate_boxes": 120,
        "noise_boxes": 480,
        "total_boxes": 600,
    }
    assert payload["candidate_row_count"] == 120
    assert payload["timing_ms"]["repeats"] == 5
    assert payload["timing_ms"]["minimum"] >= 0
    assert payload["timing_ms"]["median"] >= 0
    assert payload["timing_ms"]["maximum"] >= payload["timing_ms"]["minimum"]
    assert payload["explain_query_plan"]
    assert any(
        "ix_wh_boxitem_item" in row["detail"].lower()
        for row in payload["explain_query_plan"]
    )
