#requires -Version 5.1
$ErrorActionPreference = 'Stop'

$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$env:MYSQL_PWD = 'root'

$sql = @"
CREATE DATABASE IF NOT EXISTS midas_learning_cloud
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Drop and recreate the demo user so this script is idempotent.
DROP USER IF EXISTS 'midas'@'localhost';
CREATE USER 'midas'@'localhost' IDENTIFIED WITH mysql_native_password BY 'change-me';
GRANT ALL PRIVILEGES ON midas_learning_cloud.* TO 'midas'@'localhost';
GRANT ALL PRIVILEGES ON midas_learning_cloud_test.* TO 'midas'@'localhost';
FLUSH PRIVILEGES;

SELECT 'database ready' AS status;
"@

Write-Host '--- creating database and user ---'
& $mysql -u root -e $sql
if ($LASTEXITCODE -ne 0) { throw "mysql root setup failed ($LASTEXITCODE)" }

Write-Host '--- verifying midas user can log in ---'
$env:MYSQL_PWD = 'change-me'
$check = & $mysql -u midas -e "SELECT DATABASE() AS db, USER() AS user, VERSION() AS version;" midas_learning_cloud
if ($LASTEXITCODE -ne 0) { throw "midas login failed ($LASTEXITCODE)" }
Write-Host $check
Write-Host '--- bootstrap complete ---'
