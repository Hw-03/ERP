---
type: code-note
project: DEXCOWIN MES
layer: claude
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/.claude/settings.local.json
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# settings.local.json

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/.claude/settings.local.json]]

## 원본 첫 줄 (또는 메타)

```
{
  "permissions": {
    "allow": [
      "PowerShell(Set-Location \"c:\\\\Users\\\\HW\\\\Documents\\\\GitHub\\\\ERP\\\\frontend\"; if \\(\\(Test-Path 'package-lock.json'\\) -and \\(Test-Path 'node_modules\\\\.package-lock.json'\\)\\) { $lock = \\(Get-Item 'package-lock.json'\\).LastWriteTime; $nm = \\(Get-Item 'node_modules\\\\.package-lock.json'\\).LastWriteTime; Write-Output \"package-lock.json : $lock\"; Write-Output \"node_modules lock : $nm\"; if \\($lock -gt $nm\\) { Write-Output \"RESULT: lock is newer -> npm install needed\" } else { Write-Output \"RESULT: node_modules is up to date\" } } else { Write-Output \"One of the files is missing -> npm install needed\" })",
      "Bash(git add *)",
      "Bash(git commit -m ' *)",
      "Bash(npm run *)",
      "Bash(npx tsc *)",
      "Bash(python -m compileall app/routers/bom.py)",
      "Bash(grep -E \"\\\\.\\(png|yml|log\\)$\")",
      "Bash(python -m compileall -q backend/app)",
      "Bash(python -c ' *)",
      "Bash(python -m pip install pytest pytest-cov httpx)",
      "Bash(python -c \"import sqlite3; c=sqlite3.connect\\('erp.db'\\); print\\('invloc neg qty:', c.execute\\('SELECT COUNT\\(*\\) FROM inventory_locations WHERE quantity<0'\\).fetchone\\(\\)\\); print\\('invloc total:', c.execute\\('SELECT COUNT\\(*\\) FROM inventory_locations'\\).fetchone\\(\\)\\)\")",
      "PowerShell(powershell -ExecutionPolicy Bypass -File .\\\\scripts\\\\dev\\\\verify_local.ps1)",
      "Bash(rm C:\\\\Users\\\\HW\\\\.claude\\\\projects\\\\c--Users-HW-Documents-GitHub-ERP\\\\memory\\\\autonomous-execution-principle.md)"
    ],
    "additionalDirectories": [
      "C:\\Users\\HW\\Documents\\GitHub\\ERP"
    ]
  }
}
```
