$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-ListenPort {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$Seconds = 30
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }
    return $false
}

$backendScript = Join-Path $repoRoot "backend\start-dev.ps1"
$frontendScript = Join-Path $repoRoot "frontend\start-dev.ps1"

function Start-DevScript {
    param(
        [string]$Title,
        [string]$ScriptPath
    )

    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("& '$ScriptPath'"))
    $command = "start `"$Title`" /min powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
    & $env:ComSpec /d /c $command | Out-Null
}

function Test-BackendHealth {
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health/" -TimeoutSec 2
        return $response.status -eq "ok"
    } catch {
        return $false
    }
}

if ((Test-ListenPort 8000) -and -not (Test-BackendHealth)) {
    Write-Host "Port 8000 is occupied by another service. Stop it before starting this project." -ForegroundColor Red
    exit 1
}

if (-not (Test-ListenPort 8000)) {
    Start-DevScript "Live Agent Backend" $backendScript
}

if (-not (Test-ListenPort 5173)) {
    Start-DevScript "Live Agent Frontend" $frontendScript
}

$backendReady = Wait-HttpOk "http://127.0.0.1:8000/api/health/" 30
$frontendReady = Wait-HttpOk "http://127.0.0.1:5173/" 30

Write-Host ""
Write-Host "Backend:  http://127.0.0.1:8000/docs"
Write-Host "Frontend: http://127.0.0.1:5173/"
Write-Host "Backend ready:  $backendReady"
Write-Host "Frontend ready: $frontendReady"
Write-Host ""

if (-not $backendReady -or -not $frontendReady) {
    Write-Host "If a service is not ready, check logs in: $logDir"
    exit 1
}
