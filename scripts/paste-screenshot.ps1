# Paste Screenshot Helper
# Captures image from clipboard and saves it to a temporary location
# Usage: powershell -File scripts/paste-screenshot.ps1

param(
    [string]$OutputDir = "$env:TEMP\claude-screenshots",
    [string]$Prefix = "screenshot"
)

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# PowerShell script to get image from clipboard
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$clipboard = [System.Windows.Forms.Clipboard]::GetImage()

if ($null -eq $clipboard) {
    Write-Host "ERROR: No image found in clipboard. Please copy a screenshot first." -ForegroundColor Red
    Write-Host ""
    Write-Host "How to take a screenshot:" -ForegroundColor Yellow
    Write-Host "  1. Press Win+Shift+S to open Snipping Tool"
    Write-Host "  2. Select the area you want to capture"
    Write-Host "  3. The screenshot is automatically copied to clipboard"
    Write-Host "  4. Run this script again"
    exit 1
}

# Generate filename with timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$filename = "${Prefix}_${timestamp}.png"
$filepath = Join-Path $OutputDir $filename

# Save image
$clipboard.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)

Write-Host "Screenshot saved!" -ForegroundColor Green
Write-Host ""
Write-Host "File path:" -ForegroundColor Cyan
Write-Host "  $filepath"
Write-Host ""
Write-Host "Path copied to clipboard (ready to paste)!" -ForegroundColor Yellow

# Copy the path to clipboard for easy pasting
Set-Clipboard -Value $filepath

# Return the path (for scripting)
return $filepath
