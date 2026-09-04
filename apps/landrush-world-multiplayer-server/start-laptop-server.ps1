#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$NodeExecutable = 'node',
  [switch]$InitializeEmptyWorld,
  [switch]$Check
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'This manual launcher requires Windows.'
}

$serverDirectory = $PSScriptRoot
$serverEntry = Join-Path $serverDirectory 'server.mjs'
$localRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Landrush\ZombieGameServer'
$dataDirectory = Join-Path $localRoot 'data'
$logDirectory = Join-Path $localRoot 'logs'
$stateFile = Join-Path $dataDirectory 'world-multiplayer-state.json'
$nodePath = (Get-Command $NodeExecutable -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$nodeVersion = & $nodePath --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) {
  throw 'Node.js 22 or newer is required.'
}

foreach ($relativePath in @('server.mjs', 'network-policy.mjs', 'dist/zombie-game-server.mjs', 'dist/zombie-game-world-worker.mjs', 'dist/zombie-game-world.json')) {
  if (-not (Test-Path -LiteralPath (Join-Path $serverDirectory $relativePath) -PathType Leaf)) {
    throw "Missing $relativePath. Build the real-game authority bundle before launching."
  }
}
foreach ($driveRoot in @([IO.Path]::GetPathRoot($localRoot), [IO.Path]::GetPathRoot($serverDirectory)) | Select-Object -Unique) {
  if ([IO.DriveInfo]::new($driveRoot).AvailableFreeSpace -lt 8GB) {
    throw "At least 8 GB free is required on $driveRoot before starting."
  }
}
$newWorld = -not (Test-Path -LiteralPath $stateFile -PathType Leaf)
if ($newWorld -and -not $InitializeEmptyWorld) {
  throw 'No laptop save exists. Use -InitializeEmptyWorld only for an intentionally new world.'
}

function Get-LaptopServerListener {
  @(Get-NetTCPConnection -State Listen -LocalPort 3004 -ErrorAction SilentlyContinue)
}

$listeners = Get-LaptopServerListener
if ($listeners.Count -gt 0) {
  throw "Port 3004 is already owned by process $($listeners.OwningProcess -join ', '). No process was replaced."
}
if ($Check) {
  [pscustomobject]@{
    Ready = $true
    NodeVersion = $nodeVersion
    Address = '127.0.0.1:3004'
    DataDirectory = $dataDirectory
    LogDirectory = $logDirectory
    InitializeEmptyWorld = $newWorld
  }
  return
}

$mutex = [Threading.Mutex]::new($false, 'Local\LandrushZombieGameServer3004')
$lockTaken = $false
$child = $null
try {
  $lockTaken = $mutex.WaitOne(0)
  if (-not $lockTaken) { throw 'Another laptop-server launcher is already running.' }
  if ((Get-LaptopServerListener).Count -gt 0) { throw 'Port 3004 became occupied. Nothing was started.' }
  New-Item -ItemType Directory -Path $dataDirectory, $logDirectory -Force | Out-Null
  $runId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $stdoutLog = Join-Path $logDirectory "$runId.stdout.log"
  $stderrLog = Join-Path $logDirectory "$runId.stderr.log"
  $settings = @{
    NODE_ENV = 'production'
    PORT = '3004'
    LANDRUSH_ZOMBIE_GAME_AUTHORITY = '1'
    LANDRUSH_WORLD_MULTIPLAYER_HOST = '127.0.0.1'
    LANDRUSH_WORLD_MULTIPLAYER_WS_PORT = '3004'
    LANDRUSH_WORLD_MULTIPLAYER_WS_PATH = '/api/landrush-lab/world-multiplayer/ws'
    LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR = $dataDirectory
    LANDRUSH_WORLD_MULTIPLAYER_ALLOWED_ORIGINS = 'https://landrush.niutgames.com,http://localhost:3002'
    LANDRUSH_WORLD_MULTIPLAYER_MAX_CONNECTIONS = '32'
    LANDRUSH_WORLD_MULTIPLAYER_ALLOW_EMPTY_STATE = $(if ($newWorld) { '1' } else { '0' })
  }
  $environmentKeys = @(@(Get-ChildItem Env: | Where-Object Name -Like 'LANDRUSH_*').Name) + @($settings.Keys) + @('TUNNEL_TOKEN', 'TUNNEL_TOKEN_FILE')
  $previous = @{}
  try {
    foreach ($key in ($environmentKeys | Select-Object -Unique)) {
      $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
      [Environment]::SetEnvironmentVariable($key, $null, 'Process')
    }
    foreach ($key in $settings.Keys) {
      [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    $child = Start-Process -FilePath $nodePath -ArgumentList ('"{0}"' -f $serverEntry) -WorkingDirectory $serverDirectory -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
  } finally {
    foreach ($key in $previous.Keys) {
      [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $deadline) {
    $child.Refresh()
    if ($child.HasExited) { throw "Server exited with code $($child.ExitCode). See $stderrLog" }
    $listeners = Get-LaptopServerListener
    if ($listeners.Count -gt 0 -and @($listeners | Where-Object OwningProcess -Ne $child.Id).Count -gt 0) {
      throw 'Another process claimed port 3004 during startup.'
    }
    if ($listeners.Count -gt 0) {
      try {
        $metrics = Invoke-RestMethod -Uri 'http://127.0.0.1:3004/metrics' -TimeoutSec 1
        if ($null -ne $metrics.PSObject.Properties['zombieGameRooms']) {
          [pscustomobject]@{
            ProcessId = $child.Id
            StartedAt = $child.StartTime
            Address = '127.0.0.1:3004'
            DataDirectory = $dataDirectory
            StandardOutput = $stdoutLog
            StandardError = $stderrLog
          }
          return
        }
      } catch {}
    }
    Start-Sleep -Milliseconds 200
  }
  throw "Server did not report real-game authority readiness within 15 seconds. See $stderrLog"
} catch {
  if ($null -ne $child) {
    $child.Refresh()
    if (-not $child.HasExited) { Stop-Process -InputObject $child -ErrorAction SilentlyContinue }
  }
  throw
} finally {
  if ($lockTaken) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
