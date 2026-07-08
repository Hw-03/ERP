param(
    [ValidateSet("auto", "full", "frontend", "backend", "docs")]
    [string] $Mode = "auto",
    [switch] $DbReadOnlyCheck,
    # Playwright E2E 까지 포함(전용 DB·서버 기동 — 느림). 기본 게이트는 가볍게 유지하고 opt-in.
    [switch] $IncludeE2E
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# RepoRoot 을 git으로 정확히 계산 (스크립트 위치와 무관)
$RepoRoot = git rev-parse --show-toplevel
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

function Get-ChangedFiles {
    # staged + unstaged + untracked 모두 수집. rename/copy 의 경우 dest 경로(`->` 뒷부분)만 사용.
    $lines = git -C $RepoRoot status --porcelain 2>$null
    if (-not $lines) { return @() }
    $paths = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if ($line.Length -lt 4) { continue }
        $rest = $line.Substring(3)
        if ($rest -match ' -> ') {
            $rest = ($rest -split ' -> ', 2)[1]
        }
        # 따옴표로 둘러싸인 경로(비ASCII) 처리
        $rest = $rest.Trim().Trim('"')
        if ($rest) { $paths.Add($rest) }
    }
    return ,$paths.ToArray()
}

function Get-Category {
    param([string] $Path)
    # infra/full 우선 매칭 — 인프라 파일이 다른 영역 prefix 아래 있을 수 있음.
    $infraPatterns = @(
        '^scripts/',
        '^\.github/workflows/',
        '^Dockerfile',
        '^package\.json$',
        '^package-lock\.json$',
        '^pyproject\.toml$',
        '^bootstrap_db\.py$'
    )
    foreach ($p in $infraPatterns) {
        if ($Path -match $p) { return 'infra' }
    }

    # backend 영역 (OpenAPI baseline 포함)
    if ($Path -match '^backend/') { return 'backend' }
    if ($Path -eq '_dev/baselines/openapi.json') { return 'backend' }

    # frontend 영역
    if ($Path -match '^frontend/') { return 'frontend' }

    # docs / config 영역
    $docsPatterns = @(
        '^_attic/',
        '^\.codex/',
        '^\.claude/',
        '^\.github/',
        '^_dev/',
        '\.md$',
        '^AGENTS\.md$',
        '^CLAUDE\.md$',
        '^\.gitignore$',
        '^\.gitattributes$',
        '^LICENSE',
        '^README'
    )
    foreach ($p in $docsPatterns) {
        if ($Path -match $p) { return 'docs' }
    }

    return 'unknown'
}

function Resolve-Scope {
    $files = Get-ChangedFiles
    if ($files.Count -eq 0) {
        return @{ Scope = 'none'; Reason = 'no changes'; Files = @() }
    }
    $cats = New-Object System.Collections.Generic.HashSet[string]
    foreach ($f in $files) {
        $null = $cats.Add((Get-Category $f))
    }
    if ($cats.Contains('infra') -or $cats.Contains('unknown')) {
        $reason = if ($cats.Contains('infra')) { 'infra' } else { 'unknown files present' }
        return @{ Scope = 'full'; Reason = "escalated: $reason"; Files = $files }
    }
    $parts = @()
    if ($cats.Contains('frontend')) { $parts += 'frontend' }
    if ($cats.Contains('backend')) { $parts += 'backend' }
    if ($cats.Contains('docs') -and $parts.Count -eq 0) { $parts += 'docs' }
    if ($parts.Count -eq 0) { $parts += 'docs' }
    return @{ Scope = ($parts -join '+'); Reason = 'auto-detected'; Files = $files }
}

function Invoke-DocsGates {
    Invoke-Check "Docs whitespace check" $RepoRoot {
        git diff --check
        if ($LASTEXITCODE -ne 0) { throw "Whitespace issues detected" }
    }
}

function Invoke-FrontendGates {
    Invoke-Check "Frontend strict lint" $FrontendRoot { npm run lint:strict }
    Invoke-Check "Frontend type check" $FrontendRoot { npx tsc --noEmit }
    # coverage gate (Round-10A #5) — CI 와 동일한 threshold 50/50/50/50.
    Invoke-Check "Frontend tests + coverage" $FrontendRoot { npm run test:coverage }
    Invoke-Check "Frontend production build" $FrontendRoot { npm run build }
    # Round-16 #4 — bundle size gate (.next-prod/static/chunks, frontend script 기준).
    Invoke-Check "Frontend bundle size" $FrontendRoot { npm run check:bundle-size }
}

function Invoke-BackendGates {
    Invoke-Check "Backend pytest" $BackendRoot { python -m pytest -q }
    # OpenAPI drift check (Round-10A #5) — backend 라우터/스키마 변경 시 _dev/baselines/openapi.json 갱신 강제.
    Invoke-Check "OpenAPI drift" $BackendRoot {
        $TmpFile = Join-Path $env:TEMP "openapi-current.json"
        $BaselineFile = Join-Path $RepoRoot "_dev/baselines/openapi.json"

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
            Write-Host "  cd backend; python -c `"from app.main import app; import json; open('../_dev/baselines/openapi.json','w',encoding='utf-8').write(json.dumps(app.openapi(),indent=2,sort_keys=True,ensure_ascii=False)+chr(10))`""
            throw "OpenAPI drift"
        }
        Write-Host "✓ OpenAPI spec matches baseline."
    }
}

# ── 영역 결정 ───────────────────────────────────────
$effectiveMode = $Mode
$scopeReason = $null
$scopeFiles = @()
if ($Mode -eq 'auto') {
    $resolved = Resolve-Scope
    $effectiveMode = $resolved.Scope
    $scopeReason = $resolved.Reason
    $scopeFiles = $resolved.Files
}

Write-Host ""
Write-Host "==> Scope: $Mode → $effectiveMode$(if ($scopeReason) { " ($scopeReason)" })"
if ($scopeFiles.Count -gt 0 -and $scopeFiles.Count -le 12) {
    foreach ($f in $scopeFiles) { Write-Host "   · $f" }
}
elseif ($scopeFiles.Count -gt 12) {
    Write-Host "   · ($($scopeFiles.Count) files)"
}

if ($effectiveMode -eq 'none') {
    Write-Host ""
    Write-Host "No changes detected — skipping all gates."
    exit 0
}

$runFrontend = $false
$runBackend = $false
$runDocs = $false
switch ($effectiveMode) {
    'full'              { $runFrontend = $true; $runBackend = $true }
    'frontend'          { $runFrontend = $true }
    'backend'           { $runBackend = $true }
    'docs'              { $runDocs = $true }
    'frontend+backend'  { $runFrontend = $true; $runBackend = $true }
    default { throw "Unknown effective mode: $effectiveMode" }
}

if ($runDocs)     { Invoke-DocsGates }
if ($runBackend)  { Invoke-BackendGates }
if ($runFrontend) { Invoke-FrontendGates }

if ($DbReadOnlyCheck) {
    Invoke-Check "DB read-only consistency" $RepoRoot {
        $DbPath = Join-Path $BackendRoot "mes.db"
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

tables = [
    "items",
    "employees",
    "inventory",
    "inventory_locations",
    "transaction_logs",
    "stock_requests",
    "io_batches",
    "warehouse_box_items",
]
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

last_transaction_at = cur.execute("SELECT MAX(created_at) FROM transaction_logs").fetchone()[0]

report = {
    "db": str(db_path),
    "rows": rows,
    "inventory_mismatch_count": mismatch_count,
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

if ($IncludeE2E) {
    # 전용 DB(mes_e2e.db)·전용 백엔드(8021)·전용 프론트(3100) — globalSetup/teardown 자동.
    Invoke-Check "Playwright E2E (전용 DB)" $FrontendRoot { npx playwright test }
}

# 풀 게이트가 돈 경우에만 working tree status 노출 (부분 모드에선 노이즈).
if ($effectiveMode -eq 'full' -or $effectiveMode -eq 'frontend+backend') {
    Invoke-Check "Git working tree status" $RepoRoot { git status --short --branch }
}

Write-Host ""
Write-Host "All local verification checks passed."
