$ErrorActionPreference = 'Stop'

$WebRoot = Split-Path -Parent $PSScriptRoot
$CodexInstaller = Join-Path $WebRoot 'public/codex-acu-install.ps1'
$ClaudeInstaller = Join-Path $WebRoot 'public/claude-acu-install.ps1'
$CatalogSource = Join-Path $WebRoot 'public/codex-acu-model-catalog.json'
$Root = Join-Path ([System.IO.Path]::GetTempPath()) ("acu-windows-installers-" + [guid]::NewGuid().ToString('N'))
$FakeBin = Join-Path $Root 'fake-bin'

function Assert-Equal([object]$Actual, [object]$Expected, [string]$Message) {
  if ($Actual -ne $Expected) {
    throw "$Message`nExpected: $Expected`nActual: $Actual"
  }
}

function Assert-Contains([string]$Actual, [string]$Expected, [string]$Message) {
  if (-not $Actual.Contains($Expected)) {
    throw "$Message`nMissing: $Expected"
  }
}

function Invoke-WebRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [switch]$UseBasicParsing,
    [int]$TimeoutSec
  )
  if ($Uri -match 'codex-acu-model-catalog\.json$') {
    Copy-Item -Force $CatalogSource $OutFile
    return
  }
  throw "Unexpected network request in installer fixture: $Uri"
}

function Invoke-CodexInstaller([string]$ManagedHome, [string]$ManagedBin, [string]$ApiKey) {
  $env:CODEX_ACU_HOME = $ManagedHome
  $env:CODEX_ACU_BIN_DIR = $ManagedBin
  $env:CODEX_ACU_UPDATE_CODEX = '0'
  $env:CODEX_ACU_PREFER_NPM = '0'
  $env:CODEX_ACU_SKIP_NETWORK_CHECK = '1'
  $env:CODEX_ACU_SKIP_ENDPOINT_PREFLIGHT = '1'
  $env:CODEX_ACU_LIVE_VERIFY = '0'
  $env:CODEX_ACU_CLI_VERIFY = '0'
  $env:ACU_API_KEY = $ApiKey
  & { . $CodexInstaller }
}

function Invoke-ClaudeInstaller([string]$ManagedHome, [string]$ManagedBin, [string]$ApiKey) {
  $env:CLAUDE_ACU_HOME = $ManagedHome
  $env:CLAUDE_ACU_BIN_DIR = $ManagedBin
  $env:CLAUDE_ACU_UPDATE_CLAUDE = '0'
  $env:CLAUDE_ACU_PREFER_NPM = '0'
  $env:CLAUDE_ACU_LIVE_VERIFY = '0'
  $env:CLAUDE_ACU_CLI_VERIFY = '0'
  $env:ACU_API_KEY = $ApiKey
  & { . $ClaudeInstaller }
}

try {
  New-Item -ItemType Directory -Force -Path $FakeBin | Out-Null
  $FakeCodex = Join-Path $FakeBin 'codex'
  $FakeClaude = Join-Path $FakeBin 'claude'
  [System.IO.File]::WriteAllText(
    $FakeCodex,
    "#!/bin/sh`nif [ ""`${1:-}"" = ""--version"" ]; then echo ""codex-cli 0.147.0""; else printf '%s\n' ""`$*""; fi`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  [System.IO.File]::WriteAllText(
    $FakeClaude,
    "#!/bin/sh`nif [ ""`${1:-}"" = ""--version"" ]; then echo ""2.1.226 (Claude Code)""; else printf '%s\n' ""`$*""; fi`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  & chmod 755 $FakeCodex $FakeClaude
  $env:PATH = "$FakeBin$([System.IO.Path]::PathSeparator)$env:PATH"
  $env:USERPROFILE = $Root
  $env:LOCALAPPDATA = Join-Path $Root 'local-app-data'
  $env:OS = ''

  $CodexCleanHome = Join-Path $Root 'codex-clean-home'
  $CodexCleanBin = Join-Path $Root 'codex-clean-bin'
  Invoke-CodexInstaller $CodexCleanHome $CodexCleanBin 'sk-codex-clean'
  $CodexCleanConfig = [System.IO.File]::ReadAllText((Join-Path $CodexCleanHome 'config.toml'))
  Assert-Contains $CodexCleanConfig 'model = "acu-auto"' 'Codex clean install changed the default model.'
  Assert-Contains $CodexCleanConfig 'base_url = "https://api.acucompute.com/v1"' 'Codex clean install used the wrong Base URL.'
  $CodexCleanCatalog = [System.IO.File]::ReadAllText((Join-Path $CodexCleanHome 'model-catalog.json'))
  foreach ($model in @('acu-auto', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')) {
    Assert-Contains $CodexCleanCatalog "`"slug`": `"$model`"" "Codex clean install is missing $model."
  }

  $CodexUpgradeHome = Join-Path $Root 'codex-upgrade-home'
  $CodexUpgradeBin = Join-Path $Root 'codex-upgrade-bin'
  New-Item -ItemType Directory -Force -Path $CodexUpgradeHome | Out-Null
  $CodexCredential = Join-Path $CodexUpgradeHome 'credentials'
  [System.IO.File]::WriteAllText($CodexCredential, 'sk-codex-existing', [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText(
    (Join-Path $CodexUpgradeHome 'config.toml'),
    "model = `"acu-auto`"`n[model_providers.acu-founder-alpha]`nbase_url = `"https://existing.responses.example/v1`"`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  Invoke-CodexInstaller $CodexUpgradeHome $CodexUpgradeBin $null
  $CodexFirstHash = (Get-FileHash (Join-Path $CodexUpgradeHome 'config.toml')).Hash
  Assert-Equal ([System.IO.File]::ReadAllText($CodexCredential)) 'sk-codex-existing' 'Codex upgrade replaced the credential.'
  Assert-Contains ([System.IO.File]::ReadAllText((Join-Path $CodexUpgradeHome 'config.toml'))) 'base_url = "https://existing.responses.example/v1"' 'Codex upgrade replaced the Base URL.'
  Invoke-CodexInstaller $CodexUpgradeHome $CodexUpgradeBin $null
  Assert-Equal (Get-FileHash (Join-Path $CodexUpgradeHome 'config.toml')).Hash $CodexFirstHash 'Codex reinstall is not idempotent.'
  Assert-Equal ([System.IO.File]::ReadAllText($CodexCredential)) 'sk-codex-existing' 'Codex reinstall replaced the credential.'

  $ClaudeCleanHome = Join-Path $Root 'claude-clean-home'
  $ClaudeCleanBin = Join-Path $Root 'claude-clean-bin'
  Invoke-ClaudeInstaller $ClaudeCleanHome $ClaudeCleanBin 'sk-claude-clean'
  Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $ClaudeCleanHome 'base-url'))) 'https://api.acucompute.com' 'Claude clean install used the wrong Base URL.'
  $ClaudeCleanSettings = [System.IO.File]::ReadAllText((Join-Path $ClaudeCleanHome 'config/acu-model-settings.json'))
  foreach ($model in @('acu-auto', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-fable-5')) {
    Assert-Contains $ClaudeCleanSettings $model "Claude clean install is missing $model."
  }

  $ClaudeUpgradeHome = Join-Path $Root 'claude-upgrade-home'
  $ClaudeUpgradeBin = Join-Path $Root 'claude-upgrade-bin'
  New-Item -ItemType Directory -Force -Path (Join-Path $ClaudeUpgradeHome 'config') | Out-Null
  $ClaudeCredential = Join-Path $ClaudeUpgradeHome 'credential'
  [System.IO.File]::WriteAllText($ClaudeCredential, 'sk-claude-existing', [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $ClaudeUpgradeHome 'base-url'), 'https://existing.messages.example', [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $ClaudeUpgradeHome 'config/acu-model-settings.json'), '{"availableModels":["acu-auto"]}', [System.Text.UTF8Encoding]::new($false))
  Invoke-ClaudeInstaller $ClaudeUpgradeHome $ClaudeUpgradeBin $null
  $ClaudeFirstHash = (Get-FileHash (Join-Path $ClaudeUpgradeHome 'config/acu-model-settings.json')).Hash
  Assert-Equal ([System.IO.File]::ReadAllText($ClaudeCredential)) 'sk-claude-existing' 'Claude upgrade replaced the credential.'
  Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $ClaudeUpgradeHome 'base-url'))) 'https://existing.messages.example' 'Claude upgrade replaced the Base URL.'
  $ClaudeUpgradeSettings = [System.IO.File]::ReadAllText((Join-Path $ClaudeUpgradeHome 'config/acu-model-settings.json'))
  Assert-Contains $ClaudeUpgradeSettings 'claude-fable-5' 'Claude upgrade did not refresh model settings.'
  if ($ClaudeUpgradeSettings -match 'haiku') { throw 'Claude upgrade retained the stale Haiku mapping.' }
  Invoke-ClaudeInstaller $ClaudeUpgradeHome $ClaudeUpgradeBin $null
  Assert-Equal (Get-FileHash (Join-Path $ClaudeUpgradeHome 'config/acu-model-settings.json')).Hash $ClaudeFirstHash 'Claude reinstall is not idempotent.'
  Assert-Equal ([System.IO.File]::ReadAllText($ClaudeCredential)) 'sk-claude-existing' 'Claude reinstall replaced the credential.'

  Write-Host 'Windows installer clean, upgrade, and idempotence fixtures passed.'
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Root
}
