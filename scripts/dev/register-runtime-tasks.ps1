[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string] $RepoRoot,
    [switch] $PreflightOnly
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "runtime-task-control.ps1")

$resolvedRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
Get-Command Register-ScheduledTask -ErrorAction Stop | Out-Null
Get-Command Export-ScheduledTask -ErrorAction Stop | Out-Null
$specifications = @(
    Get-RuntimeTaskSpecification -RepoRoot $resolvedRoot -Service "backend"
    Get-RuntimeTaskSpecification -RepoRoot $resolvedRoot -Service "frontend"
)
foreach ($specification in $specifications) {
    foreach ($requiredPath in @($specification.LauncherPath, $specification.PowerShellPath, $specification.EntryScript)) {
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
            throw "Runtime task entry path not found: $requiredPath"
        }
    }
}

if ($PreflightOnly) {
    foreach ($specification in $specifications) {
        Write-Output "[runtime-task-preflight] $($specification.TaskName): trigger=none user=$($specification.UserId) runLevel=$($specification.RunLevel) restart=3/PT1M"
    }
    exit 0
}

foreach ($specification in $specifications) {
    $action = New-ScheduledTaskAction `
        -Execute $specification.Execute `
        -Argument $specification.Arguments `
        -WorkingDirectory $specification.WorkingDirectory
    $settings = New-ScheduledTaskSettingsSet `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal `
        -UserId $specification.UserId `
        -LogonType Interactive `
        -RunLevel Limited

    if ($PSCmdlet.ShouldProcess($specification.TaskName, "register triggerless DEXCOWIN MES runtime task")) {
        Register-ScheduledTask `
            -TaskName $specification.TaskName `
            -Action $action `
            -Settings $settings `
            -Principal $principal `
            -Description "On-demand DEXCOWIN MES $($specification.Profile) $($specification.Service) supervisor task" `
            -Force | Out-Null

        # The default Windows 8+ unified engine does not reliably honor RestartOnFailure
        # for these triggerless long-running tasks. Schema 1.2 selects the classic engine.
        [xml] $registeredXml = Export-ScheduledTask -TaskName $specification.TaskName
        $registeredXml.Task.version = "1.2"
        $namespace = New-Object System.Xml.XmlNamespaceManager($registeredXml.NameTable)
        $namespace.AddNamespace("t", $registeredXml.DocumentElement.NamespaceURI)
        $unifiedNode = $registeredXml.SelectSingleNode(
            "/t:Task/t:Settings/t:UseUnifiedSchedulingEngine",
            $namespace
        )
        if ($unifiedNode) {
            $unifiedNode.ParentNode.RemoveChild($unifiedNode) | Out-Null
        }
        Register-ScheduledTask `
            -TaskName $specification.TaskName `
            -Xml $registeredXml.OuterXml `
            -Force | Out-Null

        $registration = Get-RuntimeTaskRegistration `
            -RepoRoot $specification.RepoRoot `
            -Service $specification.Service
        if (-not $registration.Valid) {
            throw "Runtime task post-registration validation failed: $($registration.TaskName): $($registration.Errors -join '; ')"
        }
        Write-Output "[runtime-task] verified: $($registration.TaskName) (trigger=none, state=$($registration.State))"
    }
}
