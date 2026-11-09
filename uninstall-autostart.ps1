$ErrorActionPreference = "Stop"

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Live Agent Workbench.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath
    Write-Host "Autostart shortcut removed:"
    Write-Host $shortcutPath
} else {
    Write-Host "Autostart shortcut was not found."
}
