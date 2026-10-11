param(
  [string]$Destination = "backups",
  [ValidateRange(1, 365)]
  [int]$RetainCount = 30
)
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dbPath = Join-Path $projectRoot 'jev.db'
if ([IO.Path]::IsPathRooted($Destination) -or $Destination -match '(^|[\\/])\.\.([\\/]|$)') { throw "Destination must stay relative to project root" }
$backupRoot = Join-Path $projectRoot $Destination
if (-not (Test-Path -LiteralPath $dbPath)) { throw "Database not found: $dbPath" }
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$name = "jev-$(Get-Date -Format 'yyyyMMdd-HHmmss').db"
Copy-Item -LiteralPath $dbPath -Destination (Join-Path $backupRoot $name) -Force
$backups = @(Get-ChildItem -LiteralPath $backupRoot -Filter 'jev-*.db' -File | Sort-Object LastWriteTime -Descending)
if ($backups.Count -gt $RetainCount) {
  $backups | Select-Object -Skip $RetainCount | Remove-Item -Force
}
Write-Host "Backup created: $name"
Write-Host "Backups retained: $([Math]::Min($backups.Count, $RetainCount))/$RetainCount"
