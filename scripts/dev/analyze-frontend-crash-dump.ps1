[CmdletBinding()]
param(
    [string] $DumpPath,
    [Alias("WinDbgPath")]
    [string] $DebuggerPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Profile = & (Join-Path $PSScriptRoot "resolve-server-profile.ps1")
if ($Profile.Name -ne "development") {
    throw "This analyzer is restricted to the C:\ERP development runtime profile."
}

. (Join-Path $PSScriptRoot "runtime-paths.ps1")
$RuntimeRoot = Get-MesRuntimeRoot -RepoRoot $Profile.RepoRoot
$CrashDumpDir = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "logs\frontend\crashdumps"
$approvedRoot = [System.IO.Path]::GetFullPath($CrashDumpDir).TrimEnd('\', '/')

if ([string]::IsNullOrWhiteSpace($DumpPath)) {
    if (-not (Test-Path -LiteralPath $CrashDumpDir -PathType Container)) {
        throw "No frontend crash-dump directory was found: $CrashDumpDir"
    }
    $latestDump = Get-ChildItem -LiteralPath $CrashDumpDir -Filter "*.dmp" -File |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($null -eq $latestDump) {
        throw "No frontend .dmp file was found in $CrashDumpDir"
    }
    $DumpPath = $latestDump.FullName
}

$resolvedDumpPath = [System.IO.Path]::GetFullPath($DumpPath)
$approvedPrefix = "$approvedRoot\"
if (-not $resolvedDumpPath.StartsWith($approvedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Dump path is outside the approved frontend crash-dump directory: $resolvedDumpPath"
}
$dumpInfo = [System.IO.FileInfo]::new($resolvedDumpPath)
if ($dumpInfo.Extension -ne ".dmp") {
    throw "Frontend crash analysis accepts only .dmp files: $resolvedDumpPath"
}
if (-not (Test-Path -LiteralPath $resolvedDumpPath -PathType Leaf)) {
    throw "Frontend crash dump was not found: $resolvedDumpPath"
}
Assert-MesRuntimePathHasNoReparsePoint -Root $RuntimeRoot -Candidate $resolvedDumpPath

function Resolve-CdbPath {
    param([string] $RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        return $RequestedPath
    }

    $winDbgPackage = @(Get-AppxPackage -Name "Microsoft.WinDbg" -ErrorAction SilentlyContinue |
        Sort-Object Version -Descending |
        Select-Object -First 1)
    if ($winDbgPackage.Count -gt 0) {
        $packageCdb = Join-Path $winDbgPackage[0].InstallLocation "amd64\cdb.exe"
        if (Test-Path -LiteralPath $packageCdb -PathType Leaf) {
            return $packageCdb
        }
    }

    $cdbCommand = Get-Command "cdb.exe" -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $cdbCommand) {
        return $cdbCommand.Source
    }
    throw "cdb.exe was not found. Install the official Microsoft.WinDbg package with winget."
}

$debugger = Resolve-CdbPath -RequestedPath $DebuggerPath
$debugger = [System.IO.Path]::GetFullPath($debugger)
if (-not (Test-Path -LiteralPath $debugger -PathType Leaf)) {
    throw "CDB executable was not found: $debugger"
}

$symbolCache = Get-MesRuntimePath -RepoRoot $Profile.RepoRoot -RelativePath "tools\symbols" -CreateDirectory
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$reportPath = Join-Path $CrashDumpDir "$($dumpInfo.BaseName).$timestamp.analysis.txt"
$reportPath = [System.IO.Path]::GetFullPath($reportPath)
if (-not $reportPath.StartsWith($approvedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Analysis report path is outside the approved frontend crash-dump directory: $reportPath"
}

$symbolPath = "srv*$symbolCache*https://msdl.microsoft.com/download/symbols"
$completionMarker = "DEXCOWIN_ANALYSIS_COMPLETE"
$debuggerCommands = "!analyze -v; .ecxr; k; .echo $completionMarker; q"
$argumentList = "-logo `"$reportPath`" -y `"$symbolPath`" -z `"$resolvedDumpPath`" -c `"$debuggerCommands`""
$debuggerProcess = Start-Process -FilePath $debugger -ArgumentList $argumentList -WindowStyle Hidden -PassThru

$analysisCompleted = $false
$analysisDeadline = [DateTime]::UtcNow.AddMinutes(3)
while ([DateTime]::UtcNow -lt $analysisDeadline) {
    if (Test-Path -LiteralPath $reportPath -PathType Leaf) {
        try {
            $reportText = Get-Content -LiteralPath $reportPath -Raw -ErrorAction Stop
            if ($reportText.Contains($completionMarker)) {
                $analysisCompleted = $true
                break
            }
        }
        catch {
            # WinDbg may briefly hold the log while appending the next block.
        }
    }
    if ($debuggerProcess.HasExited) {
        break
    }
    Start-Sleep -Milliseconds 500
}

if (-not $analysisCompleted) {
    if (-not $debuggerProcess.HasExited) {
        Stop-Process -Id $debuggerProcess.Id -Force
    }
    throw "CDB did not reach the analysis completion marker within three minutes: $reportPath"
}
if (-not $debuggerProcess.HasExited -and -not $debuggerProcess.WaitForExit(30000)) {
    Stop-Process -Id $debuggerProcess.Id -Force
    throw "CDB did not exit after writing the analysis report: $reportPath"
}
$debuggerProcess.Refresh()
if ($debuggerProcess.ExitCode -ne 0) {
    throw "CDB exited with code $($debuggerProcess.ExitCode): $reportPath"
}
if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf) -or (Get-Item -LiteralPath $reportPath).Length -eq 0) {
    throw "CDB did not create a non-empty analysis report: $reportPath"
}

[pscustomobject][ordered]@{
    dumpPath = $resolvedDumpPath
    reportPath = $reportPath
    debuggerPath = $debugger
}
