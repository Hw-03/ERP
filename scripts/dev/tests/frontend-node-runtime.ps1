$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\runtime-control.ps1')

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('mes-node-runtime-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $node20 = Join-Path $testRoot 'node20.cmd'
    $node24 = Join-Path $testRoot 'node24.cmd'
    Set-Content -LiteralPath $node20 -Value '@echo v20.20.2' -Encoding ASCII
    Set-Content -LiteralPath $node24 -Value '@echo v24.15.0' -Encoding ASCII
    $configPath = Join-Path $testRoot 'frontend-node-path.txt'
    Set-Content -LiteralPath $configPath -Value $node20 -Encoding ASCII
    $profile = [pscustomobject]@{ Name = 'development' }
    $resolved = Resolve-ProfileFrontendNodeCommand -Profile $profile -RuntimeRoot $testRoot
    if ($resolved -ne $node20) { throw 'Local Node 20 must override scheduler PATH' }

    function Start-ServiceSupervisor {
        param($Profile, $Service, $Port, $ServiceDir, $StatePath, $EventPath, $ControlPath, $StdoutLog, $StderrLog, $ChildCommand, $Environment)
        return [pscustomobject]@{ ChildCommand = $ChildCommand; Environment = $Environment }
    }
    $launch = Start-ProfileFrontendSupervisor -Profile $profile -FrontendDir $testRoot -RuntimeRoot $testRoot `
        -StatePath 'state' -EventPath 'events' -ControlPath 'control' -StdoutLog 'out' -StderrLog 'err'
    if ($launch.ChildCommand[0] -ne $node20) { throw 'Supervisor must receive absolute Node 20 executable' }
    if ($launch.ChildCommand[1] -ne 'scripts/dev.js') { throw 'Supervised frontend entrypoint must remain intact' }

    Set-Content -LiteralPath $configPath -Value $node24 -Encoding ASCII
    $rejected = $false
    try { Resolve-ProfileFrontendNodeCommand -Profile $profile -RuntimeRoot $testRoot | Out-Null }
    catch { $rejected = $_.Exception.Message -match 'Node.js 20' }
    if (-not $rejected) { throw 'Node 24 must fail before a development child is launched' }

    $rejected = $false
    try { Resolve-ProfileFrontendNodeCommand -Profile ([pscustomobject]@{ Name = 'employee' }) -RuntimeRoot $testRoot | Out-Null }
    catch { $rejected = $_.Exception.Message -match 'Node.js 20' }
    if (-not $rejected) { throw 'Employee Node 24 must be rejected before launch' }
    Set-Content -LiteralPath $configPath -Value $node20 -Encoding ASCII
    $employee = Resolve-ProfileFrontendNodeCommand -Profile ([pscustomobject]@{ Name = 'employee' }) -RuntimeRoot $testRoot
    if ($employee -ne $node20) { throw 'Employee must select its own explicit Node 20' }

    Remove-Item -LiteralPath $configPath
    function Get-Command { param($Name, $CommandType, $ErrorAction) return [pscustomobject]@{ Source = $node20 } }
    $fallback = Resolve-ProfileFrontendNodeCommand -Profile $profile -RuntimeRoot $testRoot
    if ($fallback -ne $node20) { throw 'An existing PATH Node 20 must remain supported' }
    Write-Output 'frontend Node runtime contracts passed'
}
finally {
    $resolvedRoot = [IO.Path]::GetFullPath($testRoot)
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolvedRoot.StartsWith($tempBase) -or (Split-Path $resolvedRoot -Leaf) -notlike 'mes-node-runtime-*') {
        throw 'Unexpected temporary path'
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}
