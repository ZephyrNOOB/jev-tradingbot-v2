param(
  [string]$Destination = "backups"
)
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dbPath = Join-Path $projectRoot 'jev.db'
$backupRoot = Join-Path $projectRoot $Destination
if (-not (Test-Path -LiteralPath $dbPath)) { throw "Database not found: $dbPath" }
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$name = "jev-$(Get-Date -Format 'yyyyMMdd-HHmmss').db"
Copy-Item -LiteralPath $dbPath -Destination (Join-Path $backupRoot $name) -Force
Write-Host "Backup created: $name"
