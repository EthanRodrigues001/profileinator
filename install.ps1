# Profileinator installer for Windows: downloads the latest release, unpacks it to %LOCALAPPDATA%\Profileinator,
# connects it to Claude Code (skill + MCP) and opens the dashboard.
#   irm https://raw.githubusercontent.com/EthanRodrigues001/profileinator/main/install.ps1 | iex
$ErrorActionPreference = "Stop"
$repo = "EthanRodrigues001/profileinator"
$dest = Join-Path $env:LOCALAPPDATA "Profileinator"
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -like "*windows-x64.zip" } | Select-Object -First 1
if (-not $asset) { throw "No Windows build in the latest release" }
$zip = Join-Path $env:TEMP $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $zip
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive $zip -DestinationPath $env:TEMP\profileinator-unpack -Force
Move-Item (Get-ChildItem $env:TEMP\profileinator-unpack | Select-Object -First 1).FullName $dest
Remove-Item $zip, $env:TEMP\profileinator-unpack -Recurse -Force
$bin = Join-Path $dest "hq.exe"
& $bin setup
Write-Host "`nInstalled to $dest. Opening the dashboard (run '$bin ui' any time)."
& $bin ui
