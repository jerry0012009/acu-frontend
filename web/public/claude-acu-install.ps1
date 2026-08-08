$ErrorActionPreference = 'Stop'

$AcuPublicBaseUrl = 'https://eu.jerrypsy.top/acu'
$AcuDirectBaseUrl = 'https://acu-api-direct.jerrypsy.top'
$AcuHome = if ($env:CLAUDE_ACU_HOME) { $env:CLAUDE_ACU_HOME } else { Join-Path $env:USERPROFILE '.claude-acu' }
$AcuBin = if ($env:CLAUDE_ACU_BIN_DIR) { $env:CLAUDE_ACU_BIN_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\claude-acu' }
$CredentialPath = Join-Path $AcuHome 'credential'
$BaseUrlPath = Join-Path $AcuHome 'base-url'
$NativePathFile = Join-Path $AcuHome 'native-claude-path'
$NativeBin = Join-Path $AcuHome 'bin'
$PreferNpm = $env:CLAUDE_ACU_PREFER_NPM -ne '0'
$UpdateClaude = $env:CLAUDE_ACU_UPDATE_CLAUDE -ne '0'
$LiveVerify = $env:CLAUDE_ACU_LIVE_VERIFY -ne '0'
$VerifyTimeoutSec = if ($env:CLAUDE_ACU_VERIFY_TIMEOUT_SEC) { [int]$env:CLAUDE_ACU_VERIFY_TIMEOUT_SEC } else { 45 }

function Get-ManagedClaudeCommand {
  $candidates = @(
    (Join-Path $NativeBin 'claude.exe'),
    (Join-Path $NativeBin 'claude.cmd'),
    (Join-Path $AcuHome 'npm\claude.cmd'),
    (Join-Path $AcuHome 'npm\bin\claude.cmd')
  )
  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path $candidate)) {
      try {
        & $candidate --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return $candidate }
      } catch {}
    }
  }
  return $null
}

function Get-SystemClaudeCommand {
  $candidates = @(
    (Join-Path $env:USERPROFILE '.local\bin\claude.exe'),
    (Join-Path $env:USERPROFILE '.claude\bin\claude.exe')
  )
  $command = Get-Command claude -ErrorAction SilentlyContinue
  if ($command) { $candidates += $command.Source }
  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path $candidate)) {
      try {
        & $candidate --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return $candidate }
      } catch {}
    }
  }
  return $null
}

function Get-ClaudeCommand {
  $managed = Get-ManagedClaudeCommand
  if ($managed) { return $managed }
  return Get-SystemClaudeCommand
}

function Install-ClaudeNpm {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { return $false }
  $prefix = Join-Path $AcuHome 'npm'
  $claudeVersion = if ($env:CLAUDE_ACU_CLAUDE_VERSION) { $env:CLAUDE_ACU_CLAUDE_VERSION } else { 'latest' }
  New-Item -ItemType Directory -Force -Path $prefix | Out-Null
  $registries = @()
  if ($env:CLAUDE_ACU_NPM_REGISTRY) { $registries += $env:CLAUDE_ACU_NPM_REGISTRY }
  $registries += @('https://registry.npmjs.org', 'https://registry.npmmirror.com')
  foreach ($registry in $registries | Select-Object -Unique) {
    Write-Host "Installing Claude Code from $registry..."
    & npm install --global --prefix $prefix `
      "@anthropic-ai/claude-code@$claudeVersion" `
      "--registry=$registry" '--fetch-retries=1' '--fetch-timeout=60000' | Out-Host
    $npmExitCode = $LASTEXITCODE
    if ($npmExitCode -eq 0 -and (Get-ManagedClaudeCommand)) { return $true }
  }
  return $false
}

function Install-ClaudeOfficial {
  $installerPath = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-acu-installer-" + [System.Guid]::NewGuid().ToString('N') + '.ps1')
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://claude.ai/install.ps1' -OutFile $installerPath -TimeoutSec 300
    $powerShell = (Get-Process -Id $PID).Path
    & $powerShell -NoProfile -ExecutionPolicy Bypass -File $installerPath | Out-Host
    $installerExitCode = $LASTEXITCODE
    return ($installerExitCode -eq 0 -and (Get-ClaudeCommand))
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $installerPath
  }
}

function Test-MessagesEndpoint([string]$Endpoint, [string]$Token) {
  try {
    $body = @{
      model = 'acu-auto'
      max_tokens = 32
      messages = @(@{ role = 'user'; content = 'Return exactly CLAUDE_ACU_OK' })
    } | ConvertTo-Json -Depth 5
    $headers = @{ 'x-api-key' = $Token; 'anthropic-version' = '2023-06-01' }
    $response = Invoke-RestMethod -Method Post -Uri "$Endpoint/v1/messages" `
      -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 90
    return (($response.content.text -join '') -match 'CLAUDE_ACU_OK')
  } catch {
    return $false
  }
}

$Token = $env:ACU_API_KEY
if ([string]::IsNullOrWhiteSpace($Token) -and (Test-Path $CredentialPath)) {
  $Token = [System.IO.File]::ReadAllText($CredentialPath).Trim()
}
if ([string]::IsNullOrWhiteSpace($Token)) {
  $SecureToken = Read-Host 'Paste your ACU API Key' -AsSecureString
  $Token = [System.Net.NetworkCredential]::new('', $SecureToken).Password
}
if ([string]::IsNullOrWhiteSpace($Token) -or $Token.Contains("`n") -or $Token.Contains("`r")) {
  throw 'API Key must be a non-empty single line.'
}
if (-not $Token.StartsWith('sk-')) { throw 'API Key must start with sk-.' }

New-Item -ItemType Directory -Force -Path $AcuHome, $AcuBin, $NativeBin | Out-Null
$nativeClaude = Get-ManagedClaudeCommand
$updatedClaude = $false
$officialAttempted = $false
if ($UpdateClaude) {
  if ($PreferNpm -and (Install-ClaudeNpm)) {
    $nativeClaude = Get-ManagedClaudeCommand
    $updatedClaude = [bool]$nativeClaude
  }
  if (-not $updatedClaude) {
    $officialAttempted = $true
    try {
      if (Install-ClaudeOfficial) {
        $nativeClaude = Get-SystemClaudeCommand
        $updatedClaude = [bool]$nativeClaude
      }
    } catch {
      Write-Warning "The Anthropic updater was unavailable: $($_.Exception.Message)"
    }
  }
}
if (-not $nativeClaude) {
  $nativeClaude = Get-SystemClaudeCommand
}
if (-not $nativeClaude -and $PreferNpm) {
  $null = Install-ClaudeNpm
  $nativeClaude = Get-ManagedClaudeCommand
}
if (-not $nativeClaude -and -not $officialAttempted) {
  try { $null = Install-ClaudeOfficial } catch {
    Write-Warning "The Anthropic installer was unavailable: $($_.Exception.Message)"
  }
  $nativeClaude = Get-SystemClaudeCommand
}
if (-not $nativeClaude) {
  $null = Install-ClaudeNpm
  $nativeClaude = Get-ManagedClaudeCommand
}
if (-not $nativeClaude) { throw 'Unable to install Claude Code from npm mirrors or Anthropic.' }

$baseUrl = $null
$baseCandidates = @()
if ($env:CLAUDE_ACU_BASE_URL) { $baseCandidates += $env:CLAUDE_ACU_BASE_URL }
$baseCandidates += @($AcuPublicBaseUrl, $AcuDirectBaseUrl)
foreach ($candidate in $baseCandidates | Select-Object -Unique) {
  if (-not $LiveVerify -or (Test-MessagesEndpoint $candidate $Token)) {
    $baseUrl = $candidate
    break
  }
}
if (-not $baseUrl) { throw 'Neither ACU Messages endpoint completed validation.' }

[System.IO.File]::WriteAllText($CredentialPath, $Token, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($BaseUrlPath, $baseUrl, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($NativePathFile, $nativeClaude, [System.Text.UTF8Encoding]::new($false))
& icacls $CredentialPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

$launcher = @'
$ErrorActionPreference = 'Stop'
$AcuHome = if ($env:CLAUDE_ACU_HOME) { $env:CLAUDE_ACU_HOME } else { Join-Path $env:USERPROFILE '.claude-acu' }
$NativeClaude = [System.IO.File]::ReadAllText((Join-Path $AcuHome 'native-claude-path')).Trim()
$env:CLAUDE_CONFIG_DIR = Join-Path $AcuHome 'config'
$env:ANTHROPIC_BASE_URL = [System.IO.File]::ReadAllText((Join-Path $AcuHome 'base-url')).Trim()
$env:ANTHROPIC_AUTH_TOKEN = [System.IO.File]::ReadAllText((Join-Path $AcuHome 'credential')).Trim()
$env:ANTHROPIC_CUSTOM_MODEL_OPTION = 'acu-auto'
$env:ANTHROPIC_CUSTOM_MODEL_OPTION_NAME = 'ACU Auto'
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = 'acu-auto'
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = 'acu-auto'
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = 'acu-auto'
$env:CLAUDE_CODE_SUBAGENT_MODEL = 'acu-auto'
$env:CLAUDE_CODE_MAX_CONTEXT_TOKENS = '272000'
if (-not (Test-Path $NativeClaude)) { throw 'Native Claude Code is missing; rerun the installer.' }
& $NativeClaude --model acu-auto @args
exit $LASTEXITCODE
'@
$launcherPath = Join-Path $AcuBin 'claude-acu.ps1'
[System.IO.File]::WriteAllText($launcherPath, $launcher, [System.Text.UTF8Encoding]::new($false))
$cmd = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0claude-acu.ps1`" %*`r`n"
[System.IO.File]::WriteAllText((Join-Path $AcuBin 'claude-acu.cmd'), $cmd, [System.Text.UTF8Encoding]::new($false))

[Environment]::SetEnvironmentVariable('Path', (
  @(
    [Environment]::GetEnvironmentVariable('Path', 'User'),
    $AcuBin
  ) | Where-Object { $_ -and $_.Trim() } | Select-Object -Unique
) -join ';', 'User')
if (($env:Path -split ';') -notcontains $AcuBin) { $env:Path = "$env:Path;$AcuBin" }

& $launcherPath --version
if ($LiveVerify) {
  Write-Host 'Verifying a real Claude ACU request...'
  $validationJob = Start-Job -ScriptBlock {
    param([string]$Launcher)
    & $Launcher -p --max-turns 1 'Return exactly CLAUDE_ACU_OK' 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "Claude Code exited with code $LASTEXITCODE." }
  } -ArgumentList $launcherPath
  if (Wait-Job $validationJob -Timeout $VerifyTimeoutSec) {
    try {
      $validation = Receive-Job $validationJob -ErrorAction Stop | Out-String
      if ($validation -notmatch 'CLAUDE_ACU_OK') {
        Write-Warning 'Claude Code completed without the expected verification text; installation is still ready.'
      }
    } catch {
      Write-Warning "Claude Code verification failed, but installation is ready: $($_.Exception.Message)"
    } finally {
      Remove-Job $validationJob -Force -ErrorAction SilentlyContinue
    }
  } else {
    Stop-Job $validationJob -ErrorAction SilentlyContinue
    Remove-Job $validationJob -Force -ErrorAction SilentlyContinue
    Write-Warning "Claude Code verification exceeded ${VerifyTimeoutSec}s; installation is ready and can be tested with: claude-acu"
  }
}

Write-Host "claude-acu installed at $AcuBin"
Write-Host "Claude Code: $nativeClaude"
Write-Host "ACU endpoint: $baseUrl"
if (($env:Path -split ';') -notcontains $AcuBin) {
  Write-Host "Add $AcuBin to your user PATH, then run: claude-acu"
}
