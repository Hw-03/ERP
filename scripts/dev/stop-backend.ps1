# scripts/dev/stop-backend.ps1
# 포트 8011 을 잡고 있는 모든 프로세스 + uvicorn 명령줄을 가진 모든 python 강제 종료.
# 좀비 uvicorn worker 재발 방지용.
#
# 두 단계 사용 이유:
# 1) 포트 8011 listen PID 죽이기 — 일반 케이스
# 2) cmdline 매칭 python 죽이기 — reloader 가 죽은 뒤 worker 가 부모를 잃고 살아남은 케이스.
#    netstat 가 죽은 부모 PID 를 계속 보여줘서 listen-PID 만 죽이면 worker 를 못 잡음.

$ErrorActionPreference = "Stop"

function Get-Port8011Pids {
    @(
        Get-NetTCPConnection -LocalPort 8011 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Get-UvicornPythonPids {
    # CIM_Process.CommandLine 검사 — uvicorn app.main:app + 포트 8011 패턴
    @(
        Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='py.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and ($_.CommandLine -match 'uvicorn\s+app\.main:app') -and ($_.CommandLine -match '--port\s+8011') } |
            Select-Object -ExpandProperty ProcessId
    )
}

# 최대 3회 sweep — reloader 와 worker 가 연쇄적으로 죽고 살아나는 케이스 대응
for ($attempt = 1; $attempt -le 3; $attempt++) {
    $listenPids   = Get-Port8011Pids
    $uvicornPids  = Get-UvicornPythonPids
    # typed array 끼리 + 했을 때 op_Addition 못 찾는 케이스 회피 — 한 칸씩 [object[]] 에 채움.
    $combined = @()
    if ($listenPids)  { foreach ($p in $listenPids)  { $combined += [int]$p } }
    if ($uvicornPids) { foreach ($p in $uvicornPids) { $combined += [int]$p } }
    $allPids = @($combined | Sort-Object -Unique)

    if ($allPids.Count -eq 0) { break }

    foreach ($procId in $allPids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($null -eq $proc) {
            Write-Host "[stop] PID $procId already gone - attempt $attempt"
        }
        else {
            Write-Host "[stop] taskkill /T /F PID $procId ($($proc.ProcessName)) - attempt $attempt"
            & taskkill.exe /T /F /PID $procId | Out-Null
        }
    }
    Start-Sleep -Milliseconds 1000
}

$stillListen  = Get-Port8011Pids
$stillUvicorn = Get-UvicornPythonPids
if ($stillListen.Count -gt 0 -or $stillUvicorn.Count -gt 0) {
    $msg = "정리 실패 - listen: $($stillListen -join ','), uvicorn-py: $($stillUvicorn -join ',')"
    throw $msg
}

Write-Host "[stop] OK - port 8011 free, no uvicorn python alive"
