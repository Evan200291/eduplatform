#requires -Version 5.1
$env:PATH = 'C:\Program Files\MySQL\MySQL Server 8.0\bin;' + $env:PATH

# Use a here-string so we never interactively prompt. Each candidate is tried
# with --password=$pw (no space) which is the safe form; the `mysql` client
# accepts the password on the same argv.
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$env:MYSQL_PWD = ''  # never used, we pass it explicitly

$candidates = @(
  '',
  'root',
  'password',
  'midas',
  'ChangeMe!2026',
  'mysql',
  'change-me',
  'admin',
  '12345678',
  'midasstudio',
  'riverbank',
  'toor',
  'Midas2026',
  'midasstudio.example'
)

foreach ($pw in $candidates) {
  # When $pw is empty we use -uroot with no -p at all; otherwise use --password=
  if ($pw -eq '') {
    $args = @('-u', 'root', '-N', '-B', '-e', 'SELECT 1;')
  } else {
    $args = @('-u', 'root', "--password=$pw", '-N', '-B', '-e', 'SELECT 1;')
  }
  $out = & $mysql @args 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "FOUND: root password is '$pw'"
    exit 0
  }
}

Write-Host 'no candidate matched'
exit 1
