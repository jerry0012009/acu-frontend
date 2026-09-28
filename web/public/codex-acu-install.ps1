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
$RequestedBaseUrl = $env:CODEX_ACU_BASE_URL
$RunningOnWindows = $env:OS -eq 'Windows_NT'

if ($RequestedBaseUrl -and $RequestedBaseUrl -notmatch '^https://.+/v1$') {
  throw 'CODEX_ACU_BASE_URL must be an HTTPS URL ending in /v1.'
}

function Get-CodexVersion([string]$Path) {
  if (-not $Path -or -not (Test-Path $Path)) { return $null }
  $output = & $Path --version 2>$null | Out-String
  $match = [regex]::Match($output, '(\d+\.\d+\.\d+(?:[-+][^\s]+)?)')
  if (-not $match.Success) { return $null }
  return [version]($match.Groups[1].Value -replace '[-+].*$', '')
}

function Find-ManagedCodex([switch]$NpmOnly, [switch]$NativeOnly) {
  $candidates = @(
    (Join-Path $NativeBin 'codex.exe'),
    (Join-Path $NativeBin 'codex.cmd'),
    (Join-Path $NativeBin 'codex.ps1'),
    (Join-Path $AcuHome 'npm\codex.cmd'),
    (Join-Path $AcuHome 'npm\codex.exe'),
    (Join-Path $AcuHome 'npm\bin\codex.cmd'),
    (Join-Path $AcuHome 'npm\bin\codex.exe'),
    (Join-Path $AcuHome 'npm\node_modules\.bin\codex.cmd'),
    (Join-Path $AcuHome 'npm\node_modules\.bin\codex.exe')
  )
  if ($NpmOnly) {
    $npmRoot = [System.IO.Path]::GetFullPath((Join-Path $AcuHome 'npm')) + [System.IO.Path]::DirectorySeparatorChar
    $candidates = @($candidates | Where-Object {
      [System.IO.Path]::GetFullPath($_).StartsWith($npmRoot, [System.StringComparison]::OrdinalIgnoreCase)
    })
  }
  if ($NativeOnly) {
    $nativeRoot = [System.IO.Path]::GetFullPath($NativeBin) + [System.IO.Path]::DirectorySeparatorChar
    $candidates = @($candidates | Where-Object {
      [System.IO.Path]::GetFullPath($_).StartsWith($nativeRoot, [System.StringComparison]::OrdinalIgnoreCase)
    })
  }
  foreach ($candidate in $candidates | Select-Object -Unique) {
    $version = Get-CodexVersion $candidate
    if ($version -and $version -ge $MinimumCodexVersion) {
      return $candidate
    }
  }
  return $null
}

function Find-SystemCodex {
  foreach ($command in @(Get-Command codex.exe, codex.cmd, codex -ErrorAction SilentlyContinue)) {
    $path = if ($command.Path) { $command.Path } elseif ($command.Source) { $command.Source } else { $null }
    $version = Get-CodexVersion $path
    if ($path -and $version -and $version -ge $MinimumCodexVersion) {
      return $path
    }
  }
  return $null
}

function Find-Npm {
  foreach ($command in @(Get-Command npm.cmd, npm.exe, npm -ErrorAction SilentlyContinue)) {
    $path = if ($command.Path) { $command.Path } elseif ($command.Source) { $command.Source } else { $null }
    if ($path -and (Test-Path $path) -and ([System.IO.Path]::GetFileName($path) -in @('npm.cmd', 'npm.exe'))) {
      return $path
    }
  }
  return $null
}

function ConvertTo-AcuReleaseInstaller([string]$InstallerText, [string]$ReleasesBase) {
  $replacements = [ordered]@{
    '$ReleasesBaseUri = "https://releases.openai.com/codex"' = ('$ReleasesBaseUri = "' + $ReleasesBase + '"')
    '[string]$metadataResponse.Content | ConvertFrom-Json -ErrorAction Stop' = @'
$(if ($metadataResponse.Content -is [byte[]]) {
            [System.Text.Encoding]::UTF8.GetString($metadataResponse.Content)
        } else {
            [string]$metadataResponse.Content
        }) | ConvertFrom-Json -ErrorAction Stop
'@
  }
  if ($ReleasesBase -ne $OfficialCodexReleasesBase) {
    # The outer ACU loop owns failover. Do not contact GitHub inside a mirror attempt.
    $replacements['return Resolve-ReleaseFromGitHub -NormalizedVersion $normalizedVersion'] = 'throw "Could not resolve Codex metadata from $ReleasesBaseUri; trying the next source."'
    $replacements['Write-WarningStep "releases.openai.com is unavailable; falling back to GitHub Releases."'] = 'Write-WarningStep "Codex metadata from $ReleasesBaseUri could not be used."'
    $replacements['if ([string]::IsNullOrWhiteSpace($Metadata.FallbackUrl)) {'] = 'if ($true) {'
    $replacements["} catch {`n        return `$null`n    }`n    return `$resolvedRelease"] = @'
} catch {
        Write-WarningStep "Could not read release metadata from ${metadataUri}: $($_.Exception.Message)"
        return $null
    }
    return $resolvedRelease
'@
  }
  $patched = $InstallerText.Replace("`r`n", "`n")
  foreach ($entry in $replacements.GetEnumerator()) {
    if (-not $patched.Contains($entry.Key)) {
      throw 'The downloaded OpenAI installer has an unsupported release format; cannot safely configure mirror fallback.'
    }
    $patched = $patched.Replace($entry.Key, $entry.Value)
  }
  return $patched
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
      $patchedInstaller = ConvertTo-AcuReleaseInstaller $installerText $releasesBase
      [System.IO.File]::WriteAllText($patchedInstallerPath, $patchedInstaller, [System.Text.UTF8Encoding]::new($false))
      $installerArguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$patchedInstallerPath`""
      )
      $process = Start-Process -FilePath $powerShell -ArgumentList $installerArguments `
        -NoNewWindow -Wait -PassThru
      if ($process.ExitCode -eq 0 -and (Find-ManagedCodex -NativeOnly)) {
        return $true
      }
      Write-Warning "Codex installation from $releasesBase failed (exit $($process.ExitCode)); trying the next source."
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
  $npm = Find-Npm
  if (-not $npm) { return $false }
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
    # Windows PowerShell 5.1 turns native stderr (including npm warnings) into
    # ErrorRecords. Judge npm by its exit code, not by whether it wrote stderr.
    $oldErrorActionPreference = $ErrorActionPreference
    $oldNativeErrorPreference = $PSNativeCommandUseErrorActionPreference
    $npmExitCode = -1
    try {
      $ErrorActionPreference = 'Continue'
      $PSNativeCommandUseErrorActionPreference = $false
      $global:LASTEXITCODE = -1
      & $npm @npmArguments 2>&1 | ForEach-Object { $_.ToString() } | Out-Host
      $npmExitCode = $LASTEXITCODE
    } catch {
      Write-Warning "Could not run npm from ${registry}: $($_.Exception.Message)"
    } finally {
      $ErrorActionPreference = $oldErrorActionPreference
      $PSNativeCommandUseErrorActionPreference = $oldNativeErrorPreference
    }
    if ($npmExitCode -eq 0 -and (Find-ManagedCodex -NpmOnly)) { return $true }
  }
  return $false
}

function Test-AcuAsset([string]$Path, [string]$Kind) {
  if (-not (Test-Path $Path)) { return $false }
  try {
    $text = [System.IO.File]::ReadAllText($Path)
    if ($Kind -eq 'launcher') {
      return $text.Contains('gpt-6-astra') -and
        $text.Contains('gpt-6-luna') -and
        $text.Contains('gpt-6-sol') -and
        $text.Contains('Test-AllowedModel')
    }
    if ($Kind -eq 'catalog') {
      $catalog = $text | ConvertFrom-Json
      $slugs = @($catalog.models | ForEach-Object { $_.slug })
      foreach ($required in @(
        'acu-auto',
        'gpt-5.6-luna',
        'gpt-5.6-terra',
        'gpt-5.6-sol',
        'gpt-6-astra',
        'gpt-6-luna',
        'gpt-6-sol'
      )) {
        if ($slugs -notcontains $required) { return $false }
      }
      return $true
    }
  } catch {
    return $false
  }
  return $false
}

function Download-First([string[]]$Urls, [string]$Destination, [string]$AssetKind = '') {
  foreach ($url in $Urls) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $Destination -TimeoutSec 300
      if (-not $AssetKind -or (Test-AcuAsset $Destination $AssetKind)) {
        return
      }
      Write-Warning "Downloaded stale or invalid $AssetKind from $url; trying the next source."
      Remove-Item -Force -ErrorAction SilentlyContinue $Destination
    } catch {
      Remove-Item -Force -ErrorAction SilentlyContinue $Destination
    }
  }
  if ($AssetKind) {
    throw "Unable to download a current $AssetKind with GPT-6 Astra/Luna/Sol support from any configured source."
  }
  throw "Unable to download $Destination from any configured source."
}

function Test-AcuCredentialAcl([object]$Acl, [string]$UserSid) {
  if (-not $Acl.AreAccessRulesProtected) { return $false }
  $trustedSids = @($UserSid, 'S-1-5-18', 'S-1-5-32-544')
  if ($Acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin $trustedSids) {
    return $false
  }
  $userRights = 0
  foreach ($rule in $Acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { return $false }
    if ($rule.IdentityReference.Value -notin $trustedSids) { return $false }
    if ($rule.IdentityReference.Value -eq $UserSid) {
      $userRights = $userRights -bor [int]$rule.FileSystemRights
    }
  }
  $required = [int][System.Security.AccessControl.FileSystemRights]::Read -bor [int][System.Security.AccessControl.FileSystemRights]::Write
  return ($userRights -band $required) -eq $required
}

function Protect-AcuCredentialFile([string]$Path, [string]$UserSid) {
  try {
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    # Legacy installations can be readable/writable without granting WRITE_DAC.
    # Do not rewrite an already private ACL just because installation is repeated.
    if (Test-AcuCredentialAcl $acl $UserSid) { return }
    $privateAcl = New-Object System.Security.AccessControl.FileSecurity
    $privateAcl.SetAccessRuleProtection($true, $false)
    $identity = New-Object System.Security.Principal.SecurityIdentifier -ArgumentList $UserSid
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule -ArgumentList @(
      $identity,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    $privateAcl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $privateAcl -ErrorAction Stop
    if (-not (Test-AcuCredentialAcl (Get-Acl -LiteralPath $Path -ErrorAction Stop) $UserSid)) {
      throw 'Credential permissions did not pass verification.'
    }
  } catch {
    throw "Could not secure ACU credential permissions at '$Path'. Installation is incomplete. Use the Windows account that owns this installation; an administrator may need to repair a file owned by another account. Your credential has not been replaced. Details: $($_.Exception.Message)"
  }
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

$ExistingApiKey = if (Test-Path $CredentialPath) {
  [System.IO.File]::ReadAllText($CredentialPath).Trim()
} else {
  $null
}
$ApiKey = if ([string]::IsNullOrWhiteSpace($env:ACU_API_KEY)) {
  $ExistingApiKey
} else {
  $env:ACU_API_KEY
}
if ([string]::IsNullOrWhiteSpace($ApiKey) -or -not $ApiKey.StartsWith('sk-') -or $ApiKey.Contains("`n") -or $ApiKey.Contains("`r")) {
  throw "ACU_API_KEY must be provided in the install command and start with sk-."
}

New-Item -ItemType Directory -Force -Path $AcuHome, $AcuBin, $NativeBin | Out-Null
$managedCodex = Find-ManagedCodex
$nativeCodex = $managedCodex
$runtimeRefreshed = $false
$npmAttempted = $false
if ($UpdateCodex -and -not ($env:CODEX_ACU_PREFER_NPM -eq '0')) {
  $npmAttempted = $true
  if (Install-CodexNpm) {
    $nativeCodex = Find-ManagedCodex -NpmOnly
    $runtimeRefreshed = $true
  }
}
if (-not $nativeCodex) {
  $nativeCodex = Find-SystemCodex
}
if (-not $nativeCodex -and -not $npmAttempted -and -not ($env:CODEX_ACU_PREFER_NPM -eq '0')) {
  $npmAttempted = $true
  if (Install-CodexNpm) {
    $nativeCodex = Find-ManagedCodex -NpmOnly
    $runtimeRefreshed = $true
  }
}
if (-not $nativeCodex -or ($UpdateCodex -and -not $runtimeRefreshed)) {
  try {
    if (Install-CodexOfficial) {
      $nativeCodex = Find-ManagedCodex -NativeOnly
      $runtimeRefreshed = $true
    }
  } catch {
    Write-Warning "The standalone Codex installer was unavailable: $($_.Exception.Message)"
  }
}
if ($managedCodex -and $UpdateCodex -and -not $runtimeRefreshed) {
  throw 'Codex update failed; existing ACU runtime and configuration were retained. Close Codex and retry.'
}
if (-not $nativeCodex) { throw 'Codex installation completed but no usable codex command was found.' }

$catalogUrls = @(
  'https://api.acucompute.com/codex-acu-model-catalog.json',
  'https://acu-api-direct.jerrypsy.top/codex-acu-model-catalog.json',
  'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/model-catalog.json'
)
Download-First $catalogUrls $CatalogPath 'catalog'

if ($RunningOnWindows) {
  if (-not (Test-Path -LiteralPath $CredentialPath)) {
    [System.IO.File]::WriteAllText($CredentialPath, '')
  }
  $userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  Protect-AcuCredentialFile $CredentialPath $userSid
}
if ([string]::IsNullOrWhiteSpace($ExistingApiKey) -or $ApiKey -ne $ExistingApiKey) {
  [System.IO.File]::WriteAllText($CredentialPath, $ApiKey, [System.Text.UTF8Encoding]::new($false))
}

$existingBaseUrl = $null
$existingConfig = $null
if (Test-Path $ConfigPath) {
  $existingConfig = [System.IO.File]::ReadAllText($ConfigPath)
  $existingMatch = [regex]::Match($existingConfig, '(?m)^base_url = "(https://[^"\r\n]+/v1)"$')
  if ($existingMatch.Success) {
    $existingBaseUrl = $existingMatch.Groups[1].Value
  }
}
$baseUrl = if ($RequestedBaseUrl) { $RequestedBaseUrl } else { $existingBaseUrl }
if (-not $baseUrl) {
  foreach ($candidate in @($PrimaryBaseUrl, $FallbackBaseUrl)) {
    if (Test-AcuEndpoint $candidate $ApiKey) {
      $baseUrl = $candidate
      break
    }
  }
}
if (-not $baseUrl) { throw 'Neither ACU Responses endpoint is reachable with this API Key.' }

$catalogTomlPath = $CatalogPath.Replace('\', '/')
$config = @"
model = "acu-auto"
model_provider = "acu-founder-alpha"
model_reasoning_effort = "medium"
model_context_window = 1050000
model_auto_compact_token_limit = 922000
model_auto_compact_token_limit_scope = "total"
model_catalog_json = "$catalogTomlPath"

[model_providers.acu-founder-alpha]
name = "ACU Router Founder Alpha"
base_url = "$baseUrl"
env_key = "ACU_API_KEY"
wire_api = "responses"
"@
if (Test-Path $ConfigPath) {
  $eol = if ($existingConfig.Contains("`r`n")) { "`r`n" } else { "`n" }
  $section = [regex]::Match($existingConfig, '(?m)^\[')
  $topLevel = if ($section.Success) { $existingConfig.Substring(0, $section.Index) } else { $existingConfig }
  $sections = if ($section.Success) { $existingConfig.Substring($section.Index) } else { '' }
  $missing = [System.Collections.Generic.List[string]]::new()
  $managedValues = @(
    @{ Pattern = '(?m)^model_context_window\s*=[^\r\n]*(?=\r?$)'; Line = 'model_context_window = 1050000' },
    @{ Pattern = '(?m)^model_auto_compact_token_limit\s*=[^\r\n]*(?=\r?$)'; Line = 'model_auto_compact_token_limit = 922000' },
    @{ Pattern = '(?m)^model_auto_compact_token_limit_scope\s*=[^\r\n]*(?=\r?$)'; Line = 'model_auto_compact_token_limit_scope = "total"' },
    @{ Pattern = '(?m)^model_catalog_json\s*=[^\r\n]*(?=\r?$)'; Line = "model_catalog_json = `"$catalogTomlPath`"" }
  )
  foreach ($managed in $managedValues) {
    if ([regex]::IsMatch($topLevel, $managed.Pattern)) {
      $topLevel = [regex]::Replace($topLevel, $managed.Pattern, $managed.Line)
    } else {
      $missing.Add($managed.Line)
    }
  }
  if ($missing.Count -gt 0) {
    $prefix = ($missing -join $eol) + $eol
    if ($section.Success) {
      $topLevel += $prefix
    } else {
      $topLevel = $topLevel.TrimEnd("`r", "`n") + $eol + $prefix
    }
  }
  $migratedConfig = $topLevel + $sections
  if ($migratedConfig -cne $existingConfig) {
    [System.IO.File]::WriteAllText($ConfigPath, $migratedConfig, [System.Text.UTF8Encoding]::new($false))
  }
} else {
  [System.IO.File]::WriteAllText($ConfigPath, $config, [System.Text.UTF8Encoding]::new($false))
}
[System.IO.File]::WriteAllText($NativeCodexPathFile, $nativeCodex, [System.Text.UTF8Encoding]::new($false))

$launcher = @'
$ErrorActionPreference = 'Stop'
$AcuHome = if ($env:CODEX_ACU_HOME) { $env:CODEX_ACU_HOME } else { Join-Path $env:LOCALAPPDATA 'codex-acu' }
$CredentialPath = Join-Path $AcuHome 'credentials'
$ConfigPath = Join-Path $AcuHome 'config.toml'
$NativeCodexPath = [System.IO.File]::ReadAllText((Join-Path $AcuHome 'native-codex-path')).Trim()
if (-not (Test-Path $NativeCodexPath)) { throw 'Native Codex binary is missing; rerun the installer.' }

function Test-AllowedModel([string]$Model) {
  return $Model -in @(
    'acu-auto',
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'gpt-6-astra',
    'gpt-6-luna',
    'gpt-6-sol'
  )
}

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

# Keep Codex's built-in npm self-update inside the ACU-managed runtime.
$AcuNpmPrefix = Join-Path $AcuHome 'npm'
$AcuNpmRoot = [System.IO.Path]::GetFullPath($AcuNpmPrefix) + [System.IO.Path]::DirectorySeparatorChar
if ([System.IO.Path]::GetFullPath($NativeCodexPath).StartsWith($AcuNpmRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  $env:NPM_CONFIG_PREFIX = $AcuNpmPrefix
  $env:npm_config_prefix = $AcuNpmPrefix
}

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
  $configuredModelMatch = [regex]::Match($config, '(?m)^model = "([^"]+)"$')
  $configuredReasoningMatch = [regex]::Match($config, '(?m)^model_reasoning_effort = "([^"]+)"$')
  if (-not $configuredModelMatch.Success -or -not (Test-AllowedModel $configuredModelMatch.Groups[1].Value)) {
    throw 'Unsupported configured ACU model.'
  }
  $configuredReasoning = if ($configuredReasoningMatch.Success) { $configuredReasoningMatch.Groups[1].Value } else { 'default' }
  Write-Output 'codex-acu: healthy'
  Write-Output "Codex version: $(& $NativeCodexPath --version)"
  Write-Output "CODEX_HOME: $AcuHome"
  Write-Output "base_url: $effectiveBaseUrl"
  Write-Output 'model_provider: acu-founder-alpha'
  Write-Output "effective model: $($configuredModelMatch.Groups[1].Value)"
  Write-Output "reasoning effort: $configuredReasoning"
  Write-Output 'credential loaded: yes'
  exit 0
}

$selectedModel = $null
for ($index = 0; $index -lt $args.Count; $index++) {
  $argument = $args[$index]
  if ($argument -in @('-m', '--model')) {
    if ($index + 1 -ge $args.Count -or -not (Test-AllowedModel $args[$index + 1])) {
      throw "unsupported ACU model: $($args[$index + 1])"
    }
    $selectedModel = $args[$index + 1]
    $index++
  } elseif ($argument.StartsWith('--model=')) {
    if (-not (Test-AllowedModel $argument.Substring(8))) {
      throw "unsupported ACU model: $($argument.Substring(8))"
    }
    $selectedModel = $argument.Substring(8)
  } elseif ($argument -in @('--oss', '--local-provider', '-p', '--profile') -or
      $argument.StartsWith('model=') -or $argument.StartsWith('model_provider=') -or
      $argument.StartsWith('model_providers.') -or
      $argument.StartsWith('base_url=') -or $argument.StartsWith('wire_api=') -or $argument.StartsWith('env_key=')) {
    throw 'provider and endpoint overrides are not allowed by codex-acu.'
  }
}

$nativeArgs = @(
  '-c', 'model_provider="acu-founder-alpha"',
  '-c', "model_providers.acu-founder-alpha.base_url=`"$effectiveBaseUrl`"",
  '-c', 'model_providers.acu-founder-alpha.wire_api="responses"'
)
$configuredModelMatch = [regex]::Match($config, '(?m)^model = "([^"]+)"$')
$effectiveModel = if ($selectedModel) { $selectedModel } elseif ($configuredModelMatch.Success) {
  $configuredModelMatch.Groups[1].Value
} else {
  $null
}
$nativeArgs += $args
& $NativeCodexPath @nativeArgs
exit $LASTEXITCODE
'@
$launcherPath = Join-Path $AcuBin 'codex-acu-launcher.ps1'
[System.IO.File]::WriteAllText($launcherPath, $launcher, [System.Text.UTF8Encoding]::new($false))
$legacyLauncherPath = Join-Path $AcuBin 'codex-acu.ps1'
$cmd = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0codex-acu-launcher.ps1`" %*`r`n"
$launcherCommandPath = Join-Path $AcuBin 'codex-acu.cmd'
[System.IO.File]::WriteAllText($launcherCommandPath, $cmd, [System.Text.UTF8Encoding]::new($false))
if (Test-Path -LiteralPath $legacyLauncherPath) {
  try {
    Remove-Item -Force -LiteralPath $legacyLauncherPath
  } catch {
    throw "The legacy codex-acu.ps1 launcher could not be removed. Close Codex and retry: $($_.Exception.Message)"
  }
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($RunningOnWindows -and ($userPath -split ';') -notcontains $AcuBin) {
  $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $AcuBin } else { "$userPath;$AcuBin" }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
if (($env:Path -split ';') -notcontains $AcuBin) { $env:Path = "$env:Path;$AcuBin" }

$verificationLauncher = if ($RunningOnWindows) { $launcherCommandPath } else { $launcherPath }
& $verificationLauncher doctor
if ($env:CODEX_ACU_LIVE_VERIFY -ne '0' -and $CliVerify) {
  Write-Host 'Verifying a real Codex ACU request...'
  $validation = & $verificationLauncher exec --skip-git-repo-check --ephemeral 'Return exactly CODEX_ACU_OK' | Out-String
  if ($LASTEXITCODE -ne 0 -or $validation -notmatch 'CODEX_ACU_OK') {
    throw 'codex-acu live verification failed.'
  }
}

Write-Host "codex-acu installed at $AcuBin"
Write-Host "Codex version: $(& $nativeCodex --version)"
Write-Host "ACU endpoint: $baseUrl"
