param([ValidateSet('start','stop','status')][string]$Action='start', [string]$PgBin='C:\Program Files\PostgreSQL\16\bin')
$ErrorActionPreference='Stop'
$ProjectRoot=Split-Path -Parent $PSScriptRoot
$DataDir=Join-Path $ProjectRoot 'work\pgdata'
if (!(Test-Path -LiteralPath (Join-Path $PgBin 'pg_ctl.exe'))) { throw 'PostgreSQL não encontrado. Passe -PgBin com a pasta bin, ou use Docker Compose.' }
if (!(Test-Path -LiteralPath $DataDir)) { throw 'Este script controla apenas o cluster local já inicializado em work\pgdata. Para instalação nova, use Docker Compose conforme o README.' }
switch ($Action) {
  'start' { & (Join-Path $PgBin 'pg_ctl.exe') -D $DataDir status *> $null; if($LASTEXITCODE -eq 0) { Write-Output 'Banco local já está ativo.'; exit 0 }; & (Join-Path $PgBin 'pg_ctl.exe') -D $DataDir -l (Join-Path $ProjectRoot 'work\postgres.log') -o '-p 5433 -h 127.0.0.1' -w start; if($LASTEXITCODE -ne 0){throw 'Não foi possível iniciar o banco local.'} }
  'stop' { & (Join-Path $PgBin 'pg_ctl.exe') -D $DataDir -m fast -w stop }
  'status' { & (Join-Path $PgBin 'pg_ctl.exe') -D $DataDir status }
}
