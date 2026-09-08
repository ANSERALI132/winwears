# Local PostgreSQL control for WIN WEARS development.
#
# The database runs from the extracted EnterpriseDB binaries under the user's
# own profile — no Windows service, no administrator rights, nothing to
# uninstall. Stop it and the machine is exactly as it was.
#
# Usage:  powershell -ExecutionPolicy Bypass -File tools\pg.ps1 <start|stop|status|psql>
#
# The connection string lives in .env as DATABASE_URL. This script never
# prints the password.

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'psql')]
  [string]$Action = 'status',

  [string]$Home_ = "$env:USERPROFILE\pgsql-16",
  [int]$Port = 5433
)

$bin  = Join-Path $Home_ 'pgsql\bin'
$data = Join-Path $Home_ 'data'
$log  = Join-Path $Home_ 'postgres.log'

if (-not (Test-Path $bin)) {
  Write-Error "PostgreSQL binaries not found at $bin. See backend/README.md for setup."
  exit 1
}

$pgctl = Join-Path $bin 'pg_ctl.exe'

switch ($Action) {
  'start' {
    if (-not (Test-Path $data)) { Write-Error "No data directory at $data. Run initdb first."; exit 1 }
    & $pgctl -D $data -l $log -o "-p $Port" start
  }
  'stop' {
    & $pgctl -D $data -m fast stop
  }
  'status' {
    & $pgctl -D $data status
  }
  'psql' {
    # Opens an interactive shell against the development database.
    & (Join-Path $bin 'psql.exe') -h localhost -p $Port -U postgres -d winwears
  }
}
