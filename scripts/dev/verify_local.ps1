param(
    [switch] $DbReadOnlyCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$FrontendRoot = Join-Path $RepoRoot "frontend"
$BackendRoot = Join-Path $RepoRoot "backend"

function Invoke-Check {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,

        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    Push-Location $WorkingDirectory
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

Invoke-Check "Backend pytest" $BackendRoot { python -m pytest -q }
Invoke-Check "Frontend strict lint" $FrontendRoot { npm run lint:strict }
Invoke-Check "Frontend type check" $FrontendRoot { npx tsc --noEmit }
# coverage gate (Round-10A #5) — CI 와 동일한 threshold 50/50/50/50.
Invoke-Check "Frontend tests + coverage" $FrontendRoot { npm run test:coverage }
Invoke-Check "Frontend production build" $FrontendRoot { npm run build }
# OpenAPI drift check (Round-10A #5) — backend 라우터/스키마 변경 시 docs/openapi.json 갱신 강제.
Invoke-Check "OpenAPI drift" $BackendRoot {
    $TmpFile = Join-Path $env:TEMP "openapi-current.json"
    $BaselineFile = Join-Path $RepoRoot "docs/openapi.json"

    $PyScript = @'
import json
import sys
sys.path.insert(0, ".")
from app.main import app
out = sys.argv[1]
with open(out, "w", encoding="utf-8") as f:
    json.dump(app.openapi(), f, indent=2, sort_keys=True, ensure_ascii=False)
    f.write("\n")
'@
    $PyScript | python - $TmpFile
    if ($LASTEXITCODE -ne 0) {
        throw "OpenAPI 캡처 실패"
    }

    $current = Get-Content $TmpFile -Raw
    $baseline = Get-Content $BaselineFile -Raw
    if ($current -ne $baseline) {
        Write-Host ""
        Write-Host "✗ OpenAPI drift detected. baseline 갱신 필요:"
        Write-Host "  cd backend; python -c `"from app.main import app; import json; open('../docs/openapi.json','w',encoding='utf-8').write(json.dumps(app.openapi(),indent=2,sort_keys=True,ensure_ascii=False)+chr(10))`""
        throw "OpenAPI drift"
    }
    Write-Host "✓ OpenAPI spec matches baseline."
}

if ($DbReadOnlyCheck) {
    Invoke-Check "DB read-only consistency" $RepoRoot {
        $DbPath = Join-Path $BackendRoot "erp.db"
        if (-not (Test-Path $DbPath)) {
            throw "DB file not found: $DbPath"
        }

        $PythonScript = @'
import json
import sqlite3
import sys
from pathlib import Path

db_path = Path(sys.argv[1]).resolve()
uri = f"file:{db_path.as_posix()}?mode=ro"
con = sqlite3.connect(uri, uri=True)
cur = con.cursor()

tables = ["items", "employees", "inventory", "transaction_logs", "queue_batches"]
rows = {table: cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}

mismatch_count = cur.execute("""
WITH loc AS (
    SELECT item_id, COALESCE(SUM(quantity), 0) AS location_sum
    FROM inventory_locations
    GROUP BY item_id
)
SELECT COUNT(*)
FROM inventory i
LEFT JOIN loc ON loc.item_id = i.item_id
WHERE COALESCE(i.quantity, 0) != COALESCE(i.warehouse_qty, 0) + COALESCE(loc.location_sum, 0)
""").fetchone()[0]

open_queue_batches = cur.execute(
    "SELECT COUNT(*) FROM queue_batches WHERE status = 'OPEN'"
).fetchone()[0]
last_transaction_at = cur.execute("SELECT MAX(created_at) FROM transaction_logs").fetchone()[0]

report = {
    "db": str(db_path),
    "rows": rows,
    "inventory_mismatch_count": mismatch_count,
    "open_queue_batches": open_queue_batches,
    "last_transaction_at": last_transaction_at,
}
print(json.dumps(report, ensure_ascii=False, indent=2))
con.close()

if mismatch_count != 0:
    raise SystemExit(f"inventory_mismatch_count must be 0, got {mismatch_count}")
'@

        $PythonScript | python - $DbPath
        if ($LASTEXITCODE -ne 0) {
            throw "DB read-only consistency failed with exit code $LASTEXITCODE"
        }
    }
}

Invoke-Check "Git working tree status" $RepoRoot { git status --short --branch }

Write-Host ""
Write-Host "All local verification checks passed."
