param([int]$Port=3000)
$ErrorActionPreference='Stop'
$ProjectRoot=Split-Path -Parent $PSScriptRoot
$NodePath=(Get-Command node).Source
if (!(Test-Path -LiteralPath (Join-Path $ProjectRoot 'apps\api\dist\main.js'))) { throw 'Execute npm run build antes de iniciar.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { Write-Output "A porta $Port já está em uso. Abra http://localhost:$Port se o Ritmo já estiver rodando."; exit 0 }
$env:PORT="$Port"
$process=Start-Process -FilePath $NodePath -ArgumentList 'apps/api/dist/main.js' -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ProjectRoot 'work\server.log') -RedirectStandardError (Join-Path $ProjectRoot 'work\server-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $ProjectRoot 'work\server.pid') -Value $process.Id
Write-Output "Ritmo iniciado. PID $($process.Id). Abra http://localhost:$Port . Logs em work\server*.log."
