$ErrorActionPreference = "SilentlyContinue"

function Test-Url {
    param([string]$Url)
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
        return "OK"
    } catch {
        return "DOWN"
    }
}

Write-Host "Frontend 5173:" (Test-Url "http://127.0.0.1:5173/")
foreach ($port in 8000..8010) {
    $status = Test-Url "http://127.0.0.1:$port/api/health/"
    if ($status -eq "OK") {
        Write-Host ("Backend {0}: {1}" -f $port, $status)
    }
}
Write-Host ""
netstat -ano | Select-String "127.0.0.1:5173|127.0.0.1:8000|127.0.0.1:8001|127.0.0.1:8002|127.0.0.1:8003|127.0.0.1:8004|127.0.0.1:8005|127.0.0.1:8006|127.0.0.1:8007|127.0.0.1:8008|127.0.0.1:8009|127.0.0.1:8010"
