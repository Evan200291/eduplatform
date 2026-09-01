#requires -Version 5.1
$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..\backend')

# `tsx watch` calls `dotenv.config()` at the top of `env.ts`, which reads `.env`
# itself. We deliberately do NOT pre-set $env:DATABASE_URL here — a previous
# version of this script did, and the value it passed was wrapped in literal
# double-quotes (because the env file's value is `"mysql://..."`), which the
# Zod schema in `env.ts` then rejected with
#   "DATABASE_URL: must be a MySQL connection string starting with `mysql://`".

# Make sure no orphan tsx watch is bound to port 4000.
Get-Process -Name node -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*tsx*server*' } |
  ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

$log = 'C:\Users\User\AppData\Local\Temp\midas-api.log'
if (Test-Path $log) { Remove-Item $log -Force }

# Start the API detached and stream output to a log file we can tail.
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = '/c npm run dev >> "{0}" 2>&1' -f $log
$psi.WorkingDirectory = (Get-Location).Path
$psi.UseShellExecute = $true
$psi.WindowStyle = 'Hidden'
[void][System.Diagnostics.Process]::Start($psi)

Write-Host 'API starting in background; tailing log...'
Start-Sleep -Seconds 6
Get-Content $log -Tail 40
Write-Host '---'
Write-Host ('log: ' + $log)
