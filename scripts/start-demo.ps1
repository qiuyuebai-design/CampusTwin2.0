param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$demoUrl = 'http://127.0.0.1:4173'
$ready = $false
try {
    $response = Invoke-WebRequest -Uri $demoUrl -TimeoutSec 2
    if ($response.Content -match 'CampusTwin 2.0') { $ready = $true }
    else { throw 'Port 4173 belongs to a different app.' }
} catch {
    $portBusy = Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue
    if ($portBusy) { throw 'Port 4173 is occupied by another app. Stop it before launching this demo.' }
}
if (-not $ready) {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $logDir = Join-Path $projectRoot 'evidence\demo-runtime'
    [System.IO.Directory]::CreateDirectory($logDir) | Out-Null
    $oldPort = $env:PORT
    try {
        $env:PORT = '4173'
        $process = Start-Process -FilePath $nodeExe -ArgumentList 'scripts/serve.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
        $process.Id | Set-Content -LiteralPath (Join-Path $logDir 'server.pid')
    } finally { $env:PORT = $oldPort }
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try { $response = Invoke-WebRequest -Uri $demoUrl -TimeoutSec 2; if ($response.Content -match 'CampusTwin 2.0') { $ready = $true; break } } catch { }
    }
}
if (-not $ready) { throw 'The demo did not start. See evidence/demo-runtime/server-error.log.' }
Write-Output ('CampusTwin demo ready: ' + $demoUrl)
if ($OpenBrowser) { Start-Process $demoUrl }
