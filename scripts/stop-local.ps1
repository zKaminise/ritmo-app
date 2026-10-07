$ErrorActionPreference='Stop'
$ProjectRoot=Split-Path -Parent $PSScriptRoot
$PidFile=Join-Path $ProjectRoot 'work\server.pid'
if (Test-Path -LiteralPath $PidFile) {
  $ServerProcessId=[int](Get-Content -LiteralPath $PidFile)
  $ProcessInfo=Get-CimInstance Win32_Process -Filter "ProcessId=$ServerProcessId" -ErrorAction SilentlyContinue
  if ($ProcessInfo -and $ProcessInfo.Name -eq 'node.exe' -and $ProcessInfo.CommandLine -like '*apps/api/dist/main.js*') { Stop-Process -Id $ServerProcessId; Write-Output 'Ritmo encerrado.' }
  else { Write-Output 'O processo registrado não está mais ativo.' }
  Remove-Item -LiteralPath $PidFile
}
