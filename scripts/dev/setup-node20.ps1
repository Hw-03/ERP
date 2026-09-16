param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $RepoRoot) {
    throw "Git repository root not found"
}

$RuntimeRoot = [Environment]::GetEnvironmentVariable("MES_RUNTIME_ROOT", "Process")
if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
    $RuntimeRoot = Join-Path $RepoRoot "_attic\runtime"
}
elseif (-not [IO.Path]::IsPathRooted($RuntimeRoot)) {
    $RuntimeRoot = Join-Path $RepoRoot $RuntimeRoot
}
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$ToolsRoot = Join-Path $RuntimeRoot "tools"
$ConfigPath = Join-Path $RuntimeRoot "frontend-node-path.txt"

if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
    $ConfiguredNode = (Get-Content -LiteralPath $ConfigPath -Raw).Trim()
    $ConfiguredNpm = if ([IO.Path]::IsPathRooted($ConfiguredNode)) {
        Join-Path (Split-Path -Parent $ConfiguredNode) "npm.cmd"
    }
    else {
        ""
    }
    $ConfiguredVersion = $null
    if (Test-Path -LiteralPath $ConfiguredNode -PathType Leaf) {
        try {
            $ConfiguredVersion = (& $ConfiguredNode --version 2>$null | Select-Object -First 1)
        }
        catch {
            $ConfiguredVersion = $null
        }
    }
    if ($ConfiguredVersion -match '^v20\.' -and (Test-Path -LiteralPath $ConfiguredNpm -PathType Leaf)) {
        Write-Host "Node.js 20 is already configured: $ConfiguredNode"
        exit 0
    }
    throw "The existing Node.js configuration is invalid: $ConfigPath"
}

$RequiredMajor = (Get-Content -LiteralPath (Join-Path $RepoRoot ".nvmrc") -Raw).Trim()
if ($RequiredMajor -ne "20") {
    throw "setup-node20.ps1 requires .nvmrc to contain exactly 20."
}

New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
$SetupRoot = Join-Path $RuntimeRoot (".node20-setup-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $SetupRoot | Out-Null

try {
    $IndexPath = Join-Path $SetupRoot "index.json"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/index.json" -OutFile $IndexPath
    $ReleaseIndex = Get-Content -LiteralPath $IndexPath -Raw | ConvertFrom-Json
    $Release = @($ReleaseIndex) |
        Where-Object {
            $_.version -match '^v20\.' -and $_.files -contains "win-x64-zip"
        } |
        Sort-Object { [version] $_.version.TrimStart("v") } -Descending |
        Select-Object -First 1
    if (-not $Release) {
        throw "No official Node.js 20 Windows x64 ZIP release was found."
    }

    $Version = [string] $Release.version
    $ArchiveName = "node-$Version-win-x64.zip"
    $ReleaseRoot = "https://nodejs.org/dist/$Version"
    $ChecksumsPath = Join-Path $SetupRoot "SHASUMS256.txt"
    $ArchivePath = Join-Path $SetupRoot $ArchiveName
    Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseRoot/SHASUMS256.txt" -OutFile $ChecksumsPath
    Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseRoot/$ArchiveName" -OutFile $ArchivePath

    $EscapedArchiveName = [regex]::Escape($ArchiveName)
    $ChecksumLine = Get-Content -LiteralPath $ChecksumsPath |
        Where-Object { $_ -match "^([0-9a-fA-F]{64})\s+\*?$EscapedArchiveName$" } |
        Select-Object -First 1
    if (-not $ChecksumLine) {
        throw "Official SHA256 entry is missing for $ArchiveName."
    }
    $ExpectedHash = ([regex]::Match(
        $ChecksumLine,
        '^([0-9a-fA-F]{64})'
    ).Groups[1].Value).ToUpperInvariant()
    $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($ActualHash -ne $ExpectedHash) {
        throw "Node.js archive SHA256 mismatch for $ArchiveName."
    }

    $ExtractRoot = Join-Path $SetupRoot "extract"
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot
    $ExtractedTool = Join-Path $ExtractRoot "node-$Version-win-x64"
    $ExtractedNode = Join-Path $ExtractedTool "node.exe"
    $ExtractedNpm = Join-Path $ExtractedTool "npm.cmd"
    if (-not (Test-Path -LiteralPath $ExtractedNode -PathType Leaf) -or
        -not (Test-Path -LiteralPath $ExtractedNpm -PathType Leaf)) {
        throw "Downloaded Node.js toolchain is incomplete."
    }
    $ActualVersion = (& $ExtractedNode --version 2>$null | Select-Object -First 1)
    if ($ActualVersion -ne $Version) {
        throw "Downloaded Node.js executable version mismatch: $ActualVersion"
    }

    $InstallRoot = Join-Path $ToolsRoot "node-$Version-win-x64"
    if (Test-Path -LiteralPath $InstallRoot) {
        throw "Existing Node.js tool directory requires manual review: $InstallRoot"
    }
    Move-Item -LiteralPath $ExtractedTool -Destination $InstallRoot
    $InstalledNode = Join-Path $InstallRoot "node.exe"

    $ConfigTemp = Join-Path $RuntimeRoot (".frontend-node-path-" + [guid]::NewGuid().ToString("N") + ".tmp")
    try {
        [IO.File]::WriteAllText($ConfigTemp, $InstalledNode, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $ConfigTemp -Destination $ConfigPath
    }
    finally {
        if (Test-Path -LiteralPath $ConfigTemp) {
            Remove-Item -LiteralPath $ConfigTemp -Force
        }
    }
    Write-Host "Configured Node.js ${Version}: $InstalledNode"
}
finally {
    $ResolvedSetupRoot = [IO.Path]::GetFullPath($SetupRoot)
    $RuntimePrefix = $RuntimeRoot.TrimEnd('\') + '\'
    if (-not $ResolvedSetupRoot.StartsWith($RuntimePrefix, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $ResolvedSetupRoot) -notlike ".node20-setup-*") {
        throw "Refusing to clean unexpected setup path: $ResolvedSetupRoot"
    }
    if (Test-Path -LiteralPath $ResolvedSetupRoot) {
        Remove-Item -LiteralPath $ResolvedSetupRoot -Recurse -Force
    }
}
