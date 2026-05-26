param(
  [switch]$RunSeed,
  [switch]$RunStepUp,
  [switch]$DirectBackend,
  [switch]$SkipDependencyInstall,
  [string]$PythonExe = $env:PYTHON_EXE,
  [string]$NodeNpm = "npm.cmd"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $Root ".codex-login-stack-logs"
$PidFile = Join-Path $LogsDir "pids.json"

$PrivateDir = Join-Path $Root "cloud_service\private"
$PrivateSrcDir = Join-Path $PrivateDir "src"
$ApiDir = Join-Path $Root "apiContainer"
$BackendDir = Join-Path $Root "client\backend"
$MiniModelPath = "C:\Users\user\Downloads\LSTM\embedding_network_mini.h5"

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Resolve-Python {
  param([string]$Candidate)

  if ($Candidate -and (Test-Path $Candidate)) {
    return $Candidate
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return $python.Source
  }

  $bundled = "C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  if (Test-Path $bundled) {
    return $bundled
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return $py.Source
  }

  throw "No encontre Python. Pasa -PythonExe C:\ruta\python.exe o define PYTHON_EXE."
}

function Test-PortOpen {
  param([int]$Port)

  try {
    $client = New-Object Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(1000, $false)
    if ($ok) {
      $client.EndConnect($async)
      $client.Close()
      return $true
    }
    $client.Close()
  } catch {
    return $false
  }

  return $false
}

function Assert-PortFree {
  param(
    [string]$Name,
    [int]$Port
  )

  if (Test-PortOpen -Port $Port) {
    throw "$Name no puede iniciar: el puerto $Port ya esta ocupado. Cierra el proceso que lo usa o ejecuta .\stop_login_stack.ps1 si fue arrancado por este script."
  }
}

function Wait-Port {
  param(
    [string]$Name,
    [int]$Port,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen -Port $Port) {
      Write-Host "OK: $Name escucha en 127.0.0.1:$Port"
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "$Name no abrio el puerto $Port despues de $TimeoutSeconds segundos. Revisa los logs en $LogsDir."
}

function Start-ManagedProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [hashtable]$Environment = @{}
  )

  $stdout = Join-Path $LogsDir "$Name.out.log"
  $stderr = Join-Path $LogsDir "$Name.err.log"

  if (Test-Path $stdout) { Clear-Content $stdout }
  if (Test-Path $stderr) { Clear-Content $stderr }

  foreach ($key in $Environment.Keys) {
    [System.Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
  }

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru

  Write-Host "START: $Name PID=$($process.Id)"
  return [pscustomobject]@{
    Name = $Name
    Pid = $process.Id
    Port = $Environment["API_PORT"]
    LogOut = $stdout
    LogErr = $stderr
  }
}

$PythonExe = Resolve-Python -Candidate $PythonExe
Write-Host "Python: $PythonExe"
Write-Host "NPM: $NodeNpm"

if (-not (Test-Path $MiniModelPath)) {
  throw "No encontre el modelo mini en $MiniModelPath"
}

Assert-PortFree -Name "Private LSTM" -Port 8000
Assert-PortFree -Name "API Container" -Port 9001
Assert-PortFree -Name "Backend Node" -Port 4000

if (-not $SkipDependencyInstall) {
  Write-Host "Instalando/verificando dependencias Node del backend..."
  Push-Location $BackendDir
  & $NodeNpm install
  Pop-Location

  Write-Host "Aviso: no instalo requirements Python automaticamente para evitar descargas largas. Si falta algo, ejecuta:"
  Write-Host "  $PythonExe -m pip install -r `"$ApiDir\requirements.txt`""
  Write-Host "  $PythonExe -m pip install -r `"$PrivateSrcDir\requirements.txt`""
}

$processes = @()

$processes += Start-ManagedProcess `
  -Name "private-lstm-8000" `
  -FilePath $PythonExe `
  -Arguments "src\run.py" `
  -WorkingDirectory $PrivateDir `
  -Environment @{
    "API_PORT" = "8000"
    "API_HOST" = "127.0.0.1"
    "TLS_ENABLED" = "false"
    "MODEL_PATH" = $MiniModelPath
    "LSTM_DISTANCE_THRESHOLD" = "1e-9"
    "MAX_REQUEST_SIZE" = "1048576"
    "ML_SERVICE_USERNAME" = "bmfa_user"
    "ML_SERVICE_PASSWORD" = "your_secure_password_here"
    "PYTHONIOENCODING" = "utf-8"
  }
Wait-Port -Name "Private LSTM" -Port 8000 -TimeoutSeconds 120

$processes += Start-ManagedProcess `
  -Name "api-container-9001" `
  -FilePath $PythonExe `
  -Arguments "src\main.py" `
  -WorkingDirectory $ApiDir `
  -Environment @{
    "API_PORT" = "9001"
    "API_HOST" = "127.0.0.1"
    "PUBLIC_GATEWAY_STEP_UP_ENDPOINT" = "http://127.0.0.1:4000/api/auth/step-up"
    "CLOUD_PROVIDER_ENDPOINT" = "http://127.0.0.1:8000/api/biometric/validate"
    "CLOUD_PROVIDER_USERNAME" = "bmfa_user"
    "CLOUD_PROVIDER_PASSWORD" = "your_secure_password_here"
    "CLOUD_PROVIDER_VERIFY_SSL" = "false"
    "MAX_REQUEST_SIZE" = "1048576"
    "PYTHONIOENCODING" = "utf-8"
  }
Wait-Port -Name "API Container" -Port 9001 -TimeoutSeconds 90

$processes += Start-ManagedProcess `
  -Name "backend-node-4000" `
  -FilePath $NodeNpm `
  -Arguments "run start" `
  -WorkingDirectory $BackendDir `
  -Environment @{
    "PORT" = "4000"
    "NODE_ENV" = "development"
    "CORS" = "*"
    "PRIVATE_LSTM_SERVICE_URL" = "http://127.0.0.1:8000"
    "API_CONTAINER_URL" = "http://127.0.0.1:9001"
    "ML_SERVICE_USERNAME" = "bmfa_user"
    "ML_SERVICE_PASSWORD" = "your_secure_password_here"
  }
Wait-Port -Name "Backend Node" -Port 4000 -TimeoutSeconds 90

$processes | ConvertTo-Json -Depth 4 | Set-Content -Path $PidFile -Encoding UTF8

Write-Host ""
Write-Host "Stack levantado:"
Write-Host "  Private LSTM:  http://127.0.0.1:8000/health"
Write-Host "  API Container: http://127.0.0.1:9001/health"
Write-Host "  Backend Node:  http://127.0.0.1:4000"
Write-Host "Logs: $LogsDir"
Write-Host "Para apagar: .\stop_login_stack.ps1"

if ($RunSeed) {
  Push-Location $BackendDir
  if ($RunStepUp) {
    if ($DirectBackend) {
      & $NodeNpm run seed:test-login -- --call-step-up --direct-backend
    } else {
      & $NodeNpm run seed:test-login -- --call-step-up
    }
  } else {
    & $NodeNpm run seed:test-login
  }
  Pop-Location
}
