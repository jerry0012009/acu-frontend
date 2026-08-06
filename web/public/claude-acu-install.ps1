$ErrorActionPreference = 'Stop'

$AcuBaseUrl = 'https://eu.jerrypsy.top:8443'
$AcuHome = Join-Path $env:USERPROFILE '.claude-acu'
$AcuConfig = Join-Path $AcuHome 'config'
$AcuBin = Join-Path $env:LOCALAPPDATA 'Programs\claude-acu'
$CredentialPath = Join-Path $AcuHome 'credential'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host 'Claude Code is not installed; running the official Anthropic installer.'
  Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  throw "Claude Code installation did not add 'claude' to PATH."
}

$SecureToken = Read-Host 'Paste your ACU API Key' -AsSecureString
$Token = [System.Net.NetworkCredential]::new('', $SecureToken).Password
if ([string]::IsNullOrWhiteSpace($Token) -or $Token.Contains("`n") -or $Token.Contains("`r")) {
  throw 'API Key must be a non-empty single line.'
}

New-Item -ItemType Directory -Force -Path $AcuHome, $AcuConfig, $AcuBin | Out-Null
[System.IO.File]::WriteAllText($CredentialPath, $Token, [System.Text.UTF8Encoding]::new($false))
& icacls $CredentialPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

$Launcher = @'
$ErrorActionPreference = 'Stop'
$AcuHome = Join-Path $env:USERPROFILE '.claude-acu'
$env:CLAUDE_CONFIG_DIR = Join-Path $AcuHome 'config'
$env:ANTHROPIC_BASE_URL = 'https://eu.jerrypsy.top:8443'
$env:ANTHROPIC_AUTH_TOKEN = [System.IO.File]::ReadAllText((Join-Path $AcuHome 'credential')).Trim()
$env:ANTHROPIC_CUSTOM_MODEL_OPTION = 'acu-auto'
$env:ANTHROPIC_CUSTOM_MODEL_OPTION_NAME = 'ACU Auto'
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = 'acu-auto'
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = 'acu-auto'
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = 'acu-auto'
$env:CLAUDE_CODE_SUBAGENT_MODEL = 'acu-auto'
& claude --model acu-auto @args
exit $LASTEXITCODE
'@
$LauncherPath = Join-Path $AcuBin 'claude-acu.ps1'
[System.IO.File]::WriteAllText($LauncherPath, $Launcher, [System.Text.UTF8Encoding]::new($false))
$Cmd = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0claude-acu.ps1`" %*`r`n"
[System.IO.File]::WriteAllText((Join-Path $AcuBin 'claude-acu.cmd'), $Cmd, [System.Text.UTF8Encoding]::new($false))

$Headers = @{ 'x-api-key' = $Token; 'anthropic-version' = '2023-06-01' }
$Body = @{ model = 'acu-auto'; max_tokens = 32; messages = @(@{ role = 'user'; content = 'Return exactly CLAUDE_ACU_OK' }) } | ConvertTo-Json -Depth 5
$Response = Invoke-RestMethod -Method Post -Uri "$AcuBaseUrl/v1/messages" -Headers $Headers -ContentType 'application/json' -Body $Body
if (($Response.content.text -join '') -notmatch 'CLAUDE_ACU_OK') { throw 'ACU Messages connection check failed.' }

$CliResponse = & $LauncherPath -p --max-turns 1 'Return exactly CLAUDE_ACU_OK' | Out-String
if ($CliResponse -notmatch 'CLAUDE_ACU_OK') { throw 'claude-acu verification failed.' }

Write-Host "claude-acu installed at $AcuBin"
if (($env:PATH -split ';') -notcontains $AcuBin) {
  Write-Host "Add $AcuBin to your user PATH, then run: claude-acu"
}
