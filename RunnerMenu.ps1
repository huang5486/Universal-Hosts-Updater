param(
    [string]$ProjectRoot = $PSScriptRoot,
    [string]$ConfigFile = "$env:TEMP\uhu_runner_config.txt"
)

$servicesJson = & node -e "const s=require('./src/services.js'); console.log(JSON.stringify(s.SERVICE_LIST));" 2>$null
if (-not $servicesJson) {
    Write-Host "[ERROR] Cannot read service list. Check Node.js and src/services.js." -ForegroundColor Red
    pause
    exit 1
}

$services = $servicesJson | ConvertFrom-Json

function Show-Menu {
    Clear-Host
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "   Universal Hosts Updater" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Select platforms to accelerate (multi-select supported):" -ForegroundColor Yellow
    Write-Host "  1. All platforms (default)" -ForegroundColor Green

    for ($i = 0; $i -lt $services.Count; $i++) {
        $num = $i + 2
        $line = "  {0,2}. {1}" -f $num, $services[$i].label
        Write-Host $line
    }

    Write-Host ""
    Write-Host "Tip: enter multiple numbers separated by commas, e.g. 2,3,7,8" -ForegroundColor DarkGray
    Write-Host "     Press Enter directly to select all platforms." -ForegroundColor DarkGray
    Write-Host ""
}

Show-Menu
$inputText = Read-Host "Enter numbers"

if ($inputText -eq "") {
    $servicesArg = "all"
} else {
    $selectedNumbers = $inputText -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ }
    $codes = @()
    foreach ($n in $selectedNumbers) {
        if ($n -eq 1) {
            $servicesArg = "all"
            break
        }
        if ($n -ge 2 -and $n -le $services.Count + 1) {
            $codes += $services[$n - 2].code
        }
    }
    if ($servicesArg -ne "all") {
        if ($codes.Count -eq 0) {
            $servicesArg = "all"
        } else {
            $servicesArg = $codes -join ','
        }
    }
}

Write-Host ""
$minimizeInput = Read-Host "Minimize to background? (Y/n, default Y)"
if ($minimizeInput -eq "") {
    $minimizeChoice = "Y"
} else {
    $minimizeChoice = if ($minimizeInput -match '^[Yy]') { "Y" } else { "N" }
}

"SERVICES=$servicesArg" | Out-File -FilePath $ConfigFile -Encoding utf8
"MINIMIZE=$minimizeChoice" | Out-File -FilePath $ConfigFile -Append -Encoding utf8

Write-Host ""
Write-Host "Configuration saved. Starting..." -ForegroundColor Green
Start-Sleep -Milliseconds 500
