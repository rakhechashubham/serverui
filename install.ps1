<#
.SYNOPSIS
  ServerUI one-line installer for Windows (self-hosted web UI via Docker Compose).

.DESCRIPTION
  Native PowerShell equivalent of install.sh. Requires Windows PowerShell 5.1+
  or PowerShell 7+, Git, and Docker Desktop (running) with Compose v2.

  Run from an elevated prompt is NOT required. If your execution policy blocks
  scripts, run this first (process scope only, no system change):

    Set-ExecutionPolicy Bypass -Scope Process -Force

.EXAMPLE
  # One-liner (fetch + run):
  & ([scriptblock]::Create((Invoke-RestMethod https://raw.githubusercontent.com/Real-Yash/serverui/main/install.ps1)))

.EXAMPLE
  # One-liner with options:
  & ([scriptblock]::Create((Invoke-RestMethod https://raw.githubusercontent.com/Real-Yash/serverui/main/install.ps1))) -Version v0.2.0 -Dir "$env:USERPROFILE\serverui"

.EXAMPLE
  # Downloaded file:
  .\install.ps1 -Version v0.2.0 -WebPort 3100 -ApiPort 8180
#>
[CmdletBinding()]
param(
  [string]$Version = $(if ($env:SERVERUI_VERSION) { $env:SERVERUI_VERSION } else { 'main' }),
# NOTE: $HOME does not exist on Windows PowerShell 5.1, so prefer USERPROFILE.
[string]$Dir = $(if ($env:SERVERUI_DIR) { $env:SERVERUI_DIR } else { if ($env:USERPROFILE) { Join-Path $env:USERPROFILE 'serverui' } else { Join-Path $HOME 'serverui' } }),
  [int]$WebPort = $(if ($env:WEB_PORT) { [int]$env:WEB_PORT } else { 3000 }),
  [int]$ApiPort = $(if ($env:HTTP_PORT) { [int]$env:HTTP_PORT } else { 8080 }),
  [switch]$Yes,
  [switch]$Uninstall,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# $HOME is missing on Windows PowerShell 5.1; USERPROFILE is always set there.
$HomeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }

$RepoUrl = $(if ($env:SERVERUI_REPO_URL) { $env:SERVERUI_REPO_URL } else { 'https://github.com/rakhechashubham/serverui.git' })
# NOTE: the default above is the upstream repo (stable tags for end users).
# This script itself is currently fetched from a fork's raw URL until it is
# merged upstream — set SERVERUI_REPO_URL to install from a fork.

function Write-Info($Message) { Write-Host "[serverui] $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "[serverui] WARNING: $Message" -ForegroundColor Yellow }
function Write-Fail($Message) { Write-Host "[serverui] ERROR: $Message" -ForegroundColor Red }

function Show-Usage {
  @'
ServerUI installer for Windows (Docker Compose self-host)

Usage: install.ps1 [-Version <ref>] [-Dir <path>] [-WebPort <port>] [-ApiPort <port>] [-Yes] [-Uninstall] [-Help]

  -Version <ref>   Git tag/branch to install (default: main, e.g. v0.2.0)
  -Dir <path>      Install directory (default: $HOME\serverui)
  -WebPort <port>  Host port for the web UI (default: 3000)
  -ApiPort <port>  Host port for the Go API (default: 8080)
  -Yes             Skip the confirmation prompt for non-empty dirs
  -Uninstall       Stop the stack (docker compose down) and exit
  -Help            Show this help and exit

One-liners (run: Set-ExecutionPolicy Bypass -Scope Process -Force):
  & ([scriptblock]::Create((Invoke-RestMethod https://raw.githubusercontent.com/Real-Yash/serverui/main/install.ps1)))
  & ([scriptblock]::Create((Invoke-RestMethod https://raw.githubusercontent.com/Real-Yash/serverui/main/install.ps1))) -Version v0.2.0

Requirements: Git, Docker Desktop (running) with Compose v2.
After install: Web http://localhost:<web-port>  API http://localhost:<api-port>/healthz
'@
}

function Test-Command($Name) {
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function New-HexKey {
  # 32 random bytes as 64 hex chars (AES-256-GCM key).
  if (Test-Command 'openssl.exe') {
    return (openssl.exe rand -hex 32).Trim()
  }
  if (Test-Command 'openssl') {
    return (openssl rand -hex 32).Trim()
  }
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function New-Password {
  if (Test-Command 'openssl.exe') {
    return ((openssl.exe rand -base64 24).Trim() -replace '[/+=\r\n]', '')
  }
  if (Test-Command 'openssl') {
    return ((openssl rand -base64 24).Trim() -replace '[/+=\r\n]', '')
  }
  $bytes = New-Object byte[] 18
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $hex = (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
  return $hex.Substring(0, 24)
}

function Set-EnvKey($File, $Key, $Value) {
  # Replace a KEY=... line or append it. Values we generate are hex/alphanumeric.
  $content = [IO.File]::ReadAllText($File)
  if ($content -match "(?m)^$Key=") {
    $content = $content -replace "(?m)^$Key=.*$", "$Key=$Value"
  }
  else {
    if (-not $content.EndsWith("`n")) { $content += "`n" }
    $content += "$Key=$Value`n"
  }
  [IO.File]::WriteAllText($File, $content)
}

function Test-PortInUse($Port) {
  # Pure .NET TCP probe, no external tools needed.
  $client = New-Object Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    return $iar.AsyncWaitHandle.WaitOne(500)
  }
  catch { return $false }
  finally { $client.Close() }
}

function Test-Health($Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    return ($response.StatusCode -eq 200)
  }
  catch { return $false }
}

if ($Help) { Show-Usage; return }

# Expand a leading ~ in -Dir.
if (($Dir -eq '~') -or ($Dir.StartsWith('~/')) -or ($Dir.StartsWith('~\'))) {
  $Dir = Join-Path $HomeDir ($Dir.Substring(1).TrimStart('/\'))
}

foreach ($cmd in @('git', 'docker')) {
  if (-not (Test-Command $cmd)) {
    Write-Fail "Required command '$cmd' not found. Install it and re-run."
    exit 1
  }
}

& docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Fail 'Docker is installed but the daemon is not running.'
  Write-Fail 'Start Docker Desktop, then re-run.'
  exit 1
}

& docker compose version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Fail "Docker Compose v2 is required ('docker compose version' failed)."
  Write-Fail 'Update Docker Desktop, then re-run.'
  exit 1
}

if (Test-PortInUse $WebPort) {
  Write-Warn "Port $WebPort looks occupied. The web UI may fail to start — use -WebPort to pick another."
}
if (Test-PortInUse $ApiPort) {
  Write-Warn "Port $ApiPort looks occupied. The API may fail to start — use -ApiPort to pick another."
}

Write-Info "ServerUI install: version=${Version} dir=${Dir} web=:${WebPort} api=:${ApiPort}"

$composeFile = 'deploy/docker/docker-compose.yml'

if ($Uninstall) {
  if (Test-Path (Join-Path $Dir $composeFile)) {
    Push-Location $Dir
    try {
      if (Test-Path '.env') {
        & docker compose -f $composeFile --env-file .env down
      }
      else {
        & docker compose -f $composeFile down
      }
    }
    finally { Pop-Location }
    Write-Info "Stack stopped. Data volume 'serverui-postgres-data' was kept."
    Write-Info 'Full wipe (destroys DB): docker volume rm serverui-postgres-data'
  }
  else {
    Write-Fail "Nothing to uninstall: $(Join-Path $Dir $composeFile) not found."
    exit 1
  }
  return
}

# --- Fetch the repo (clone or update) ---
if (Test-Path (Join-Path $Dir '.git')) {
  Write-Info "Existing checkout found, updating to ${Version}..."
  & git -C $Dir fetch --tags origin
  if ($LASTEXITCODE -ne 0) { exit 1 }
  & git -C $Dir checkout $Version
  if ($LASTEXITCODE -ne 0) { exit 1 }
  & git -C $Dir pull --ff-only origin $Version
}
elseif ((Test-Path $Dir) -and @(Get-ChildItem $Dir -Force | Select-Object -First 1).Count -gt 0) {
  if (-not $Yes -and [Environment]::UserInteractive) {
    $answer = Read-Host "Directory $Dir exists and is not empty. Clone into it anyway? [y/N]"
    if ($answer -notmatch '^[yY]') { Write-Fail 'Aborted.'; exit 1 }
  }
  Write-Info "Cloning ServerUI (${Version}) into existing dir..."
  $tmp = "$Dir.tmp.$PID"
  & git clone --depth 1 --branch $Version $RepoUrl $tmp
  if ($LASTEXITCODE -ne 0) { exit 1 }
  # robocopy (ships with Windows) copies dotfiles like .git that '*' would skip.
  # Exit codes 0-7 mean success; 8+ is failure.
  & robocopy $tmp $Dir /E /NFL /NDL /NJH /NJS > $null
  if ($LASTEXITCODE -gt 7) { exit 1 }
  Remove-Item $tmp -Recurse -Force
}
else {
  Write-Info "Cloning ServerUI (${Version})..."
  $parent = Split-Path $Dir -Parent
  if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory $parent -Force > $null }
  & git clone --depth 1 --branch $Version $RepoUrl $Dir
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

Set-Location $Dir

# --- .env setup ---
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Info 'Created .env from .env.example'
}

$envContent = [IO.File]::ReadAllText('.env')
if ($envContent -match '(?m)^SERVERUI_CREDENTIAL_ENCRYPTION_KEY=\s*$') {
  Set-EnvKey '.env' 'SERVERUI_CREDENTIAL_ENCRYPTION_KEY' (New-HexKey)
  Write-Info 'Generated SERVERUI_CREDENTIAL_ENCRYPTION_KEY in .env'
}

$envContent = [IO.File]::ReadAllText('.env')
if ($envContent -match '(?m)^POSTGRES_PASSWORD=example_password$') {
  Set-EnvKey '.env' 'POSTGRES_PASSWORD' (New-Password)
  Write-Info 'Generated a random POSTGRES_PASSWORD in .env (was example default)'
}

Set-EnvKey '.env' 'WEB_PORT' "$WebPort"
Set-EnvKey '.env' 'HTTP_PORT' "$ApiPort"

# --- Start the stack ---
Write-Info 'Building and starting services (first run takes a few minutes)...'
& docker compose -f $composeFile --env-file .env up -d --build --remove-orphans
if ($LASTEXITCODE -ne 0) { exit 1 }

# --- Wait for health ---
$apiUrl = "http://127.0.0.1:${ApiPort}/healthz"
Write-Info "Waiting for the API at $apiUrl ..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  if (Test-Health $apiUrl) { $ready = $true; break }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Write-Fail 'API did not become healthy in ~120s. Recent logs:'
  & docker compose -f $composeFile --env-file .env logs --tail=100
  exit 1
}

if (Test-Health "http://127.0.0.1:${WebPort}/healthz") {
  Write-Info 'Web UI is responding too.'
}
else {
  Write-Warn "API is up but the web UI on :${WebPort} is not responding yet — give it a minute, then check 'docker compose logs web'."
}

Write-Host ''
Write-Host 'ServerUI is running.' -ForegroundColor Green
Write-Host ''
Write-Host "  Web:    http://localhost:${WebPort}"
Write-Host "  API:    http://localhost:${ApiPort}/healthz"
Write-Host ''
Write-Host "  Install dir: ${Dir}  (version: ${Version})"
Write-Host '  Update:      re-run this script with the same -Dir'
Write-Host "  Logs:        docker compose -f $composeFile --env-file .env logs --tail=100"
Write-Host "  Stop:        docker compose -f $composeFile --env-file .env down"
Write-Host ''
Write-Host 'Add a server in the UI (name, host, SSH port, username, password or private key).'
