$ErrorActionPreference = 'Stop'

$MinimumCodexVersion = [version]'0.124.0'
$PrimaryBaseUrl = 'https://api.acucompute.com/v1'
$FallbackBaseUrl = 'https://acu-api-direct.jerrypsy.top/v1'
$PublicCodexMirrorBase = 'https://api.acucompute.com/codex-releases'
$DirectCodexMirrorBase = 'https://acu-api-direct.jerrypsy.top/codex-releases'
$OfficialCodexReleasesBase = 'https://releases.openai.com/codex'
$AcuHome = if ($env:CODEX_ACU_HOME) { $env:CODEX_ACU_HOME } else { Join-Path $env:LOCALAPPDATA 'codex-acu' }
$AcuBin = if ($env:CODEX_ACU_BIN_DIR) { $env:CODEX_ACU_BIN_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\codex-acu' }
$NativeBin = Join-Path $AcuHome 'bin'
$CredentialPath = Join-Path $AcuHome 'credentials'
$CatalogPath = Join-Path $AcuHome 'model-catalog.json'
$ConfigPath = Join-Path $AcuHome 'config.toml'
$NativeCodexPathFile = Join-Path $AcuHome 'native-codex-path'
$UpdateCodex = $env:CODEX_ACU_UPDATE_CODEX -ne '0'
$CliVerify = $env:CODEX_ACU_CLI_VERIFY -eq '1'

function Get-CodexVersion([string]$Path) {
  if (-not $Path -or -not (Test-Path $Path)) { return $null }
  $output = & $Path --version 2>$null | Out-String
  $match = [regex]::Match($output, '(\d+\.\d+\.\d+(?:[-+][^\s]+)?)')
  if (-not $match.Success) { return $null }
  return [version]($match.Groups[1].Value -replace '[-+].*$', '')
}

function Find-ManagedCodex {
  $candidates = @(
    (Join-Path $NativeBin 'codex.exe'),
    (Join-Path $NativeBin 'codex.cmd'),
    (Join-Path $AcuHome 'npm\codex.exe'),
    (Join-Path $AcuHome 'npm\codex.cmd'),
    (Join-Path $AcuHome 'npm\bin\codex.exe'),
    (Join-Path $AcuHome 'npm\bin\codex.cmd')
  )
  foreach ($candidate in $candidates | Select-Object -Unique) {
    $version = Get-CodexVersion $candidate
    if ($version -and $version -ge $MinimumCodexVersion) {
      return $candidate
    }
  }
  return $null
}

function Find-SystemCodex {
  $command = Get-Command codex -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  $commandPath = if ($command.Source) { $command.Source } else { $command.Path }
  $version = Get-CodexVersion $commandPath
  if ($version -and $version -ge $MinimumCodexVersion) {
    return $commandPath
  }
  return $null
}

function Install-CodexOfficial {
  Write-Host 'Installing the latest Codex CLI into the private ACU runtime...'
  $installerPath = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-acu-installer-" + [System.Guid]::NewGuid().ToString("N") + '.ps1')
  $patchedInstallerPath = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-acu-installer-patched-" + [System.Guid]::NewGuid().ToString("N") + '.ps1')
  Download-First @(
    "$PublicCodexMirrorBase/install.ps1",
    "$DirectCodexMirrorBase/install.ps1",
    'https://chatgpt.com/codex/install.ps1'
  ) $installerPath
  $installerText = [System.IO.File]::ReadAllText($installerPath)
  $releaseLine = '$ReleasesBaseUri = "https://releases.openai.com/codex"'
  if (-not $installerText.Contains($releaseLine)) {
    throw 'The downloaded OpenAI installer has an unsupported release URL format.'
  }

  $oldNonInteractive = $env:CODEX_NON_INTERACTIVE
  $oldInstallDir = $env:CODEX_INSTALL_DIR
  $oldCodexHome = $env:CODEX_HOME
  $oldCodexRelease = $env:CODEX_RELEASE
  $oldPreferReleases = $env:CODEX_INSTALLER_USE_RELEASES_OPENAI_COM
  try {
    $env:CODEX_NON_INTERACTIVE = '1'
    $env:CODEX_INSTALL_DIR = $NativeBin
    $env:CODEX_HOME = Join-Path $AcuHome 'native-codex'
    $env:CODEX_RELEASE = if ($env:CODEX_ACU_CODEX_VERSION) { $env:CODEX_ACU_CODEX_VERSION } else { 'latest' }
    $env:CODEX_INSTALLER_USE_RELEASES_OPENAI_COM = '1'
    $powerShell = (Get-Process -Id $PID).Path
    foreach ($releasesBase in @($DirectCodexMirrorBase, $PublicCodexMirrorBase, $OfficialCodexReleasesBase)) {
      Write-Host "Trying Codex releases from $releasesBase..."
      $patchedInstaller = $installerText.Replace($releaseLine, "`$ReleasesBaseUri = `"$releasesBase`"")
      [System.IO.File]::WriteAllText($patchedInstallerPath, $patchedInstaller, [System.Text.UTF8Encoding]::new($false))
      $installerArguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$patchedInstallerPath`""
      )
      $process = Start-Process -FilePath $powerShell -ArgumentList $installerArguments `
        -NoNewWindow -Wait -PassThru
      if ($process.ExitCode -eq 0 -and (Find-ManagedCodex)) {
        return $true
      }
    }
    return $false
  } finally {
    $env:CODEX_NON_INTERACTIVE = $oldNonInteractive
    $env:CODEX_INSTALL_DIR = $oldInstallDir
    $env:CODEX_HOME = $oldCodexHome
    $env:CODEX_RELEASE = $oldCodexRelease
    $env:CODEX_INSTALLER_USE_RELEASES_OPENAI_COM = $oldPreferReleases
    Remove-Item -Force -ErrorAction SilentlyContinue $installerPath, $patchedInstallerPath
  }
}

function Install-CodexNpm {
  $npmCommand = $null
  foreach ($name in @('npm.cmd', 'npm.exe', 'npm')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
      $npmCommand = $command.Source
      break
    }
  }
  if (-not $npmCommand) { return $false }
  $prefix = Join-Path $AcuHome 'npm'
  $codexRelease = if ($env:CODEX_ACU_CODEX_VERSION) { $env:CODEX_ACU_CODEX_VERSION } else { 'latest' }
  New-Item -ItemType Directory -Force -Path $prefix | Out-Null
  foreach ($registry in @('https://registry.npmjs.org', 'https://registry.npmmirror.com')) {
    Write-Host "Installing Codex CLI $codexRelease from $registry..."
    $npmArguments = @(
      'install',
      '--global',
      '--prefix', $prefix,
      "@openai/codex@$codexRelease",
      "--registry=$registry",
      '--fetch-retries=1',
      '--fetch-timeout=60000'
    )
    & $npmCommand @npmArguments 2>&1 | Out-Host
    $npmExitCode = $LASTEXITCODE
    if ($npmExitCode -eq 0 -and (Find-ManagedCodex)) { return $true }
  }
  return $false
}

function Download-First([string[]]$Urls, [string]$Destination) {
  foreach ($url in $Urls) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $Destination -TimeoutSec 300
      return
    } catch {
      Remove-Item -Force -ErrorAction SilentlyContinue $Destination
    }
  }
  throw "Unable to download $Destination from any configured source."
}

function Test-AcuEndpoint([string]$Endpoint, [string]$ApiKey) {
  if ($env:CODEX_ACU_SKIP_NETWORK_CHECK -eq '1') { return $true }
  try {
    Invoke-RestMethod -Method Get -Uri "$Endpoint/models" -Headers @{ Authorization = "Bearer $ApiKey" } -TimeoutSec 20 | Out-Null
    return $true
  } catch {
    return $false
  }
}

$ApiKey = $env:ACU_API_KEY
if ([string]::IsNullOrWhiteSpace($ApiKey) -and (Test-Path $CredentialPath)) {
  $ApiKey = [System.IO.File]::ReadAllText($CredentialPath).Trim()
}
if ([string]::IsNullOrWhiteSpace($ApiKey) -or -not $ApiKey.StartsWith('sk-') -or $ApiKey.Contains("`n") -or $ApiKey.Contains("`r")) {
  throw "ACU_API_KEY must be provided in the install command and start with sk-."
}

New-Item -ItemType Directory -Force -Path $AcuHome, $AcuBin, $NativeBin | Out-Null
$managedCodex = Find-ManagedCodex
$nativeCodex = $managedCodex
$npmAttempted = $false
if ($UpdateCodex -and -not ($env:CODEX_ACU_PREFER_NPM -eq '0')) {
  $npmAttempted = $true
  if (Install-CodexNpm) {
    $nativeCodex = Find-ManagedCodex
  }
}
if (-not $nativeCodex) {
  $nativeCodex = Find-SystemCodex
}
if (-not $nativeCodex -and -not $npmAttempted -and -not ($env:CODEX_ACU_PREFER_NPM -eq '0')) {
  $npmAttempted = $true
  if (Install-CodexNpm) {
    $nativeCodex = Find-ManagedCodex
  }
}
if (-not $nativeCodex) {
  try {
    $null = Install-CodexOfficial
    $nativeCodex = Find-ManagedCodex
  } catch {
    Write-Warning "The standalone Codex installer was unavailable: $($_.Exception.Message)"
  }
}
if (-not $nativeCodex) { throw 'Codex installation completed but no usable codex command was found.' }

$catalogUrls = @(
  'https://api.acucompute.com/codex-acu-model-catalog.json',
  'https://acu-api-direct.jerrypsy.top/codex-acu-model-catalog.json',
  'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/model-catalog.json'
)
Download-First $catalogUrls $CatalogPath

[System.IO.File]::WriteAllText($CredentialPath, $ApiKey, [System.Text.UTF8Encoding]::new($false))
& icacls $CredentialPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

$baseUrl = $null
foreach ($candidate in @($PrimaryBaseUrl, $FallbackBaseUrl)) {
  if (Test-AcuEndpoint $candidate $ApiKey) {
    $baseUrl = $candidate
    break
  }
}
if (-not $baseUrl) { throw 'Neither ACU Responses endpoint is reachable with this API Key.' }

$catalogTomlPath = $CatalogPath.Replace('\', '/')
$config = @"
model = "acu-auto"
model_provider = "acu-founder-alpha"
model_reasoning_effort = "medium"
model_context_window = 272000
model_auto_compact_token_limit = 258400
model_auto_compact_token_limit_scope = "total"
model_catalog_json = "$catalogTomlPath"

[model_providers.acu-founder-alpha]
name = "ACU Router Founder Alpha"
base_url = "$baseUrl"
env_key = "ACU_API_KEY"
wire_api = "responses"
"@
[System.IO.File]::WriteAllText($ConfigPath, $config, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($NativeCodexPathFile, $nativeCodex, [System.Text.UTF8Encoding]::new($false))

$launcher = @'
$ErrorActionPreference = 'Stop'
$AcuHome = if ($env:CODEX_ACU_HOME) { $env:CODEX_ACU_HOME } else { Join-Path $env:LOCALAPPDATA 'codex-acu' }
$CredentialPath = Join-Path $AcuHome 'credentials'
$ConfigPath = Join-Path $AcuHome 'config.toml'
$NativeCodexPath = [System.IO.File]::ReadAllText((Join-Path $AcuHome 'native-codex-path')).Trim()
if (-not (Test-Path $NativeCodexPath)) { throw 'Native Codex binary is missing; rerun the installer.' }

if ($args.Count -gt 0 -and @('--version', '-V') -contains $args[0]) {
  & $NativeCodexPath --version
  exit $LASTEXITCODE
}
if ($args.Count -gt 0 -and $args[0] -eq 'home') {
  Write-Output $AcuHome
  exit 0
}
if (-not (Test-Path $CredentialPath)) { throw 'ACU credential is missing; rerun the installer.' }
$env:CODEX_HOME = $AcuHome
$env:ACU_API_KEY = [System.IO.File]::ReadAllText($CredentialPath).Trim()
if (-not $env:ACU_API_KEY.StartsWith('sk-')) { throw 'Invalid ACU credential.' }

$config = [System.IO.File]::ReadAllText($ConfigPath)
$configuredMatch = [regex]::Match($config, '(?m)^base_url = "(https://.*/v1)"$')
if (-not $configuredMatch.Success) { throw 'Invalid ACU Base URL.' }
$configuredBaseUrl = $configuredMatch.Groups[1].Value
$effectiveBaseUrl = $configuredBaseUrl
if ($env:CODEX_ACU_SKIP_ENDPOINT_PREFLIGHT -ne '1') {
  foreach ($candidate in @($configuredBaseUrl, 'https://api.acucompute.com/v1', 'https://acu-api-direct.jerrypsy.top/v1') | Select-Object -Unique) {
    try {
      Invoke-RestMethod -Method Get -Uri "$candidate/models" -Headers @{ Authorization = "Bearer $env:ACU_API_KEY" } -TimeoutSec 12 | Out-Null
      $effectiveBaseUrl = $candidate
      break
    } catch {}
  }
}

if ($args.Count -gt 0 -and $args[0] -eq 'doctor') {
  Write-Output 'codex-acu: healthy'
  Write-Output "Codex version: $(& $NativeCodexPath --version)"
  Write-Output "CODEX_HOME: $AcuHome"
  Write-Output "base_url: $effectiveBaseUrl"
  Write-Output 'model_provider: acu-founder-alpha'
  Write-Output 'effective model: acu-auto'
  Write-Output 'reasoning effort: medium'
  Write-Output 'credential loaded: yes'
  exit 0
}

foreach ($argument in $args) {
  if ($argument -in @('-m', '--model') -or $argument.StartsWith('--model=') -or $argument.StartsWith('model=') -or $argument.StartsWith('model_provider=')) {
    throw 'codex-acu fixes model=acu-auto and provider=acu-founder-alpha; explicit model overrides are not allowed.'
  }
}

& $NativeCodexPath `
  -m 'acu-auto' `
  -c 'model_provider="acu-founder-alpha"' `
  -c 'model_reasoning_effort="medium"' `
  -c "model_providers.acu-founder-alpha.base_url=`"$effectiveBaseUrl`"" `
  @args
exit $LASTEXITCODE
'@
$launcherPath = Join-Path $AcuBin 'codex-acu.ps1'
[System.IO.File]::WriteAllText($launcherPath, $launcher, [System.Text.UTF8Encoding]::new($false))
$cmd = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0codex-acu.ps1`" %*`r`n"
[System.IO.File]::WriteAllText((Join-Path $AcuBin 'codex-acu.cmd'), $cmd, [System.Text.UTF8Encoding]::new($false))

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $AcuBin) {
  $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $AcuBin } else { "$userPath;$AcuBin" }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
if (($env:Path -split ';') -notcontains $AcuBin) { $env:Path = "$env:Path;$AcuBin" }

& $launcherPath doctor
if ($env:CODEX_ACU_LIVE_VERIFY -ne '0' -and $CliVerify) {
  Write-Host 'Verifying a real Codex ACU request...'
  $validation = & $launcherPath exec --skip-git-repo-check --ephemeral 'Return exactly CODEX_ACU_OK' | Out-String
  if ($LASTEXITCODE -ne 0 -or $validation -notmatch 'CODEX_ACU_OK') {
    throw 'codex-acu live verification failed.'
  }
}

Write-Host "codex-acu installed at $AcuBin"
Write-Host "Codex version: $(& $nativeCodex --version)"
Write-Host "ACU endpoint: $baseUrl"
