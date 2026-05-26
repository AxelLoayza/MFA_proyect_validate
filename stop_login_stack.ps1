$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $Root ".codex-login-stack-logs"
$PidFile = Join-Path $LogsDir "pids.json"

if (-not (Test-Path $PidFile)) {
  Write-Host "No encontre $PidFile. No hay procesos registrados por start_login_stack.ps1."
  exit 0
}

$processes = Get-Content $PidFile -Raw | ConvertFrom-Json
if ($processes -isnot [System.Array]) {
  $processes = @($processes)
}

foreach ($entry in $processes) {
  $proc = Get-Process -Id $entry.Pid -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Host "STOP: $($entry.Name) PID=$($entry.Pid)"
    Stop-Process -Id $entry.Pid -Force
  } else {
    Write-Host "SKIP: $($entry.Name) PID=$($entry.Pid) ya no esta corriendo"
  }
}

Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Stack detenido."
