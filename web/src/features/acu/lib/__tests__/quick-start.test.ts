import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ACU_API_BASE_URL,
  ACU_DEFAULT_MODEL,
  ACU_MASKED_API_KEY,
  CC_SWITCH_CLAUDE_API_BASE_URL,
  CC_SWITCH_CODEX_API_BASE_URL,
  CC_SWITCH_MODEL_MAPPINGS,
  buildApiCurl,
  buildHermesConfig,
  buildOpenClawConfig,
  buildPowerShellInstallCommand,
  buildUnixFallbackInstallCommand,
  buildUnixInstallCommand,
  buildWindowsCommandPromptInstall,
  maskCredentialText,
} from '../quick-start.ts'

const secret = 'sk-test-secret-123'

test('canonical install commands use the public ACU installer URL', () => {
  const unix = buildUnixInstallCommand('codex', secret)
  const claudeUnix = buildUnixInstallCommand('claude', secret)
  const powershell = buildPowerShellInstallCommand('claude', secret)

  assert.match(unix, /https:\/\/api\.acucompute\.com\/codex-acu-install\.sh/)
  assert.match(
    claudeUnix,
    /https:\/\/api\.acucompute\.com\/claude-acu-install\.sh/
  )
  assert.match(
    powershell,
    /https:\/\/api\.acucompute\.com\/claude-acu-install\.ps1/
  )
  assert.match(unix, /ACU_API_KEY='sk-test-secret-123'/)
  assert.match(
    unix,
    /&& export PATH="\$\{CODEX_ACU_BIN_DIR:-\$HOME\/\.local\/bin\}:\$PATH"/
  )
  assert.match(
    claudeUnix,
    /&& export PATH="\$\{CLAUDE_ACU_BIN_DIR:-\$HOME\/\.local\/bin\}:\$PATH"/
  )
  assert.match(powershell, /\$env:ACU_API_KEY='sk-test-secret-123'/)
})

test('fallback commands retain direct and GitHub sources', () => {
  const codexCommand = buildUnixFallbackInstallCommand('codex', secret)
  const command = buildUnixFallbackInstallCommand('claude', secret)

  assert.match(
    codexCommand,
    /raw\.githubusercontent\.com\/jerry0012009\/ClawRouter\/main\/tools\/codex-acu\/install\.sh/
  )
  assert.match(command, /acu-api-direct\.jerrypsy\.top/)
  assert.match(
    command,
    /raw\.githubusercontent\.com\/jerry0012009\/acu-frontend\/main\/web\/public\/claude-acu-install\.sh/
  )
  assert.match(command, /ACU_API_KEY='sk-test-secret-123'/)
  assert.match(
    codexCommand,
    /&& export PATH="\$\{CODEX_ACU_BIN_DIR:-\$HOME\/\.local\/bin\}:\$PATH"/
  )
  assert.match(
    command,
    /&& export PATH="\$\{CLAUDE_ACU_BIN_DIR:-\$HOME\/\.local\/bin\}:\$PATH"/
  )
})

test('Windows Command Prompt updates the current PATH after the PowerShell installer', () => {
  const powershell = buildPowerShellInstallCommand('codex', secret)
  const codexCommand = buildWindowsCommandPromptInstall(powershell)
  const claudeCommand = buildWindowsCommandPromptInstall(
    buildPowerShellInstallCommand('claude', secret)
  )

  assert.match(
    codexCommand,
    /^powershell\.exe -NoProfile -ExecutionPolicy Bypass/
  )
  assert.match(codexCommand, /codex-acu-install\.ps1/)
  assert.match(
    codexCommand,
    /&& set "PATH=%PATH%;%LOCALAPPDATA%\\Programs\\codex-acu"$/
  )
  assert.match(
    claudeCommand,
    /claude-acu-install\.ps1.*&& set "PATH=%PATH%;%LOCALAPPDATA%\\Programs\\claude-acu"$/
  )
})

test('API examples cover the supported ACU endpoints', () => {
  assert.match(buildApiCurl('responses', secret), /\/v1\/responses/)
  assert.match(buildApiCurl('messages', secret), /\/v1\/messages/)
})

test('OpenClaw config selects ACU Auto as the primary model', () => {
  const config = buildOpenClawConfig(secret)

  assert.match(config, /"api": "openai-responses"/)
  assert.match(config, /"primary": "acu\/acu-auto"/)
})

test('Hermes config uses the verified named ACU custom provider', () => {
  const config = buildHermesConfig(secret)

  assert.match(config, /default: acu-auto/)
  assert.match(config, /provider: acu/)
  assert.match(config, /custom_providers:/)
  assert.match(config, /name: acu/)
  assert.match(config, /base_url: https:\/\/api\.acucompute\.com\/v1/)
  assert.match(config, /api_key: sk-test-secret-123/)
  assert.match(config, /api_mode: codex_responses/)
  assert.match(config, /model: acu-auto/)
  assert.match(config, /streaming: true/)
  assert.doesNotMatch(config, /chat_completions/)
})

test('preview display masks credentials while credentialed copy values remain usable', () => {
  const config = buildOpenClawConfig(secret)
  const displayed = maskCredentialText(config, secret)

  assert.equal(ACU_API_BASE_URL, 'https://api.acucompute.com/v1')
  assert.equal(ACU_DEFAULT_MODEL, 'acu-auto')
  assert.equal(ACU_MASKED_API_KEY, 'sk-••••••')
  assert.doesNotMatch(displayed, /sk-test-secret-123/)
  assert.match(displayed, /sk-••••••/)

  const hermesConfig = buildHermesConfig(secret)
  const hermesDisplayed = maskCredentialText(hermesConfig, secret)
  assert.doesNotMatch(hermesDisplayed, /sk-test-secret-123/)
  assert.match(hermesDisplayed, /sk-••••••/)
})

test('CC Switch setup exposes canonical endpoints and the Codex model mapping', () => {
  assert.equal(CC_SWITCH_CODEX_API_BASE_URL, 'https://api.acucompute.com/v1')
  assert.equal(CC_SWITCH_CLAUDE_API_BASE_URL, 'https://api.acucompute.com')
  assert.deepEqual(
    CC_SWITCH_MODEL_MAPPINGS.map((mapping) => [
      mapping.menuName,
      mapping.requestModel,
      mapping.contextWindow,
    ]),
    [
      ['acu-auto', 'acu-auto', 260000],
      ['gpt-5.6-luna', 'gpt-5.6-luna', 260000],
      ['gpt-5.6-terra', 'gpt-5.6-terra', 260000],
      ['gpt-5.6-sol', 'gpt-5.6-sol', 260000],
      ['gpt-5.5', 'gpt-5.5', 260000],
      ['gpt-5.4-mini', 'gpt-5.4-mini', 260000],
    ]
  )
})
