# Portable handoff bundle builder (target PC needs NO Python/Node).
#
# Output: Desktop\DEXCOWIN_MES_handoff_<date>.zip
#   Unzip and double-click RUN.bat. No install required.
#
# Contents: portable Python 3.12 + portable Node 20 + frontend prod build
#           + backend/erp.db (as-is) + RUN.bat + Korean readme.
#
# NOTE: This script is intentionally ASCII-only. Windows PowerShell 5.1
#       reads .ps1 as ANSI; non-ASCII here-strings break parsing.
#       Korean readme lives in scripts/dev/bundle_readme_ko.txt and is
#       copied byte-exact into the bundle.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ROOT   = (Resolve-Path "$PSScriptRoot\..\..").Path
$CACHE  = Join-Path $env:TEMP "mes_bundle_cache"
$STAGE  = Join-Path $env:TEMP "mes_bundle_stage"
$DATE   = Get-Date -Format "yyyyMMdd"
$OUTZIP = Join-Path ([Environment]::GetFolderPath("Desktop")) "DEXCOWIN_MES_handoff_$DATE.zip"
$README = Join-Path $PSScriptRoot "bundle_readme_ko.txt"

$NODE_VER = "v20.18.1"
$NODE_URL = "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-win-x64.zip"
$PY_URL   = "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-pc-windows-msvc-install_only.tar.gz"

if (-not (Test-Path $README)) { throw "missing $README" }
New-Item -ItemType Directory -Force -Path $CACHE | Out-Null
if (Test-Path $STAGE) { Remove-Item $STAGE -Recurse -Force }
New-Item -ItemType Directory -Force -Path $STAGE | Out-Null

function Get-Cached($url, $name) {
  $dst = Join-Path $CACHE $name
  if (-not (Test-Path $dst)) {
    Write-Host "[bundle] download $name ..."
    Invoke-WebRequest -Uri $url -OutFile $dst -UseBasicParsing
  } else {
    Write-Host "[bundle] cached $name"
  }
  return $dst
}

# 1) frontend production build (.next-prod)
Write-Host "[bundle] frontend build ..."
Push-Location (Join-Path $ROOT "frontend")
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm run build failed" }
Pop-Location

# 2) portable Node
$nodeZip = Get-Cached $NODE_URL "node.zip"
$nodeTmp = Join-Path $STAGE "_node_tmp"
Expand-Archive -Path $nodeZip -DestinationPath $nodeTmp -Force
$nodeInner = Get-ChildItem $nodeTmp -Directory | Select-Object -First 1
Move-Item $nodeInner.FullName (Join-Path $STAGE "node")
Remove-Item $nodeTmp -Recurse -Force

# 3) portable Python (python-build-standalone, install_only -> top-level python/)
$pyTar = Get-Cached $PY_URL "python.tar.gz"
Write-Host "[bundle] extract python ..."
tar -xzf $pyTar -C $STAGE
if (-not (Test-Path (Join-Path $STAGE "python\python.exe"))) { throw "python extract failed" }

# 4) pip install backend runtime deps into bundled python
Write-Host "[bundle] pip install backend deps ..."
$pyExe = Join-Path $STAGE "python\python.exe"
& $pyExe -m pip install --disable-pip-version-check --no-warn-script-location -r (Join-Path $ROOT "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

# 5) stage project source (robocopy, exclude heavy/irrelevant)
Write-Host "[bundle] stage project ..."
$appDir = Join-Path $STAGE "app"
$xd = @(
  "$ROOT\.git", "$ROOT\_backup", "$ROOT\_archive", "$ROOT\vault",
  "$ROOT\frontend\_archive", "$ROOT\frontend\.next",
  "$ROOT\.playwright-mcp", "$ROOT\node_modules"
)
$xf = @("erp_backup*.db", "*.pyc")
robocopy $ROOT $appDir /MIR /XD $xd /XF $xf /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed (code $LASTEXITCODE)" }
Get-ChildItem $appDir -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 6) launchers (space/Korean-path safe, copied byte-exact) + Korean readme
Copy-Item (Join-Path $PSScriptRoot "bundle_RUN.bat")      (Join-Path $STAGE "RUN.bat")
Copy-Item (Join-Path $PSScriptRoot "bundle_backend.bat")  (Join-Path $STAGE "_backend.bat")
Copy-Item (Join-Path $PSScriptRoot "bundle_frontend.bat") (Join-Path $STAGE "_frontend.bat")
Copy-Item $README (Join-Path $STAGE "READ_ME_first.txt")

# 7) zip
Write-Host "[bundle] zip -> $OUTZIP"
if (Test-Path $OUTZIP) { Remove-Item $OUTZIP -Force }
Compress-Archive -Path (Join-Path $STAGE "*") -DestinationPath $OUTZIP -CompressionLevel Optimal
$sizeMB = [math]::Round((Get-Item $OUTZIP).Length / 1MB, 1)
Write-Host "[bundle] DONE: $OUTZIP ($sizeMB MB)"
Write-Host "[bundle] stage kept for local test: $STAGE"
