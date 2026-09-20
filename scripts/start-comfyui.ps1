param(
  [string]$ComfyUIHome = $(if ($env:COMFYUI_HOME) { $env:COMFYUI_HOME } else { Join-Path $HOME "ComfyUI" }),
  [int]$Port = 8188
)

$ErrorActionPreference = "Stop"
$healthUrl = "http://127.0.0.1:$Port/system_stats"

function Test-ComfyUI {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-ComfyUI) {
  Write-Host "ComfyUI is already running at http://127.0.0.1:$Port"
  exit 0
}

$python = Join-Path $ComfyUIHome "venv\Scripts\python.exe"
$main = Join-Path $ComfyUIHome "main.py"
if (-not (Test-Path $python) -or -not (Test-Path $main)) {
  throw "ComfyUI was not found at $ComfyUIHome. Set COMFYUI_HOME to your ComfyUI folder."
}

$logDir = Join-Path $ComfyUIHome "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdout = Join-Path $logDir "dna-studio-comfyui.out.log"
$stderr = Join-Path $logDir "dna-studio-comfyui.err.log"

$startArgs = @{
  FilePath = $python
  ArgumentList = @("main.py", "--listen", "127.0.0.1", "--port", "$Port", "--lowvram", "--disable-all-custom-nodes", "--preview-method", "none")
  WorkingDirectory = $ComfyUIHome
  RedirectStandardOutput = $stdout
  RedirectStandardError = $stderr
  WindowStyle = "Hidden"
  PassThru = $true
}
$process = Start-Process @startArgs

for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 1
  if (Test-ComfyUI) {
    Write-Host "ComfyUI started locally at http://127.0.0.1:$Port (PID $($process.Id))"
    Write-Host "Logs: $stdout"
    exit 0
  }
  if ($process.HasExited) {
    throw "ComfyUI exited during startup. Check $stderr"
  }
}

Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
throw "ComfyUI did not become healthy within 90 seconds. Check $stderr"