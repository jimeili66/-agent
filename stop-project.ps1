$ErrorActionPreference = "SilentlyContinue"

$lines = netstat -ano | Select-String "127.0.0.1:5173|127.0.0.1:8000|127.0.0.1:8001|127.0.0.1:8002|127.0.0.1:8003|127.0.0.1:8004|127.0.0.1:8005|127.0.0.1:8006|127.0.0.1:8007|127.0.0.1:8008|127.0.0.1:8009|127.0.0.1:8010"
$pids = @()
foreach ($line in $lines) {
    $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
    if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
        $pids += [int]$parts[4]
    }
}
$pids = $pids | Select-Object -Unique

if (-not $pids) {
    Write-Host "No frontend/backend process is listening on 5173 or 8000-8010."
    exit 0
}

foreach ($processId in $pids) {
    Stop-Process -Id $processId -Force
    Write-Host "Stopped process:" $processId
}
