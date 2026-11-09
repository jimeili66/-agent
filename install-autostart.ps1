$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$target = Join-Path $repoRoot "start-project.bat"
$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Live Agent Workbench.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Start the livestream e-commerce Agent workbench"
$shortcut.Save()

Write-Host "Autostart shortcut created:"
Write-Host $shortcutPath
