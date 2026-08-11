import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ACU_API_BASE_URL,
  ACU_DEFAULT_MODEL,
  ACU_MASKED_API_KEY,
  buildApiCurl,
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
  const powershell = buildPowerShellInstallCommand('claude', secret)

  assert.match(unix, /https:\/\/api\.acucompute\.com\/codex-acu-install\.sh/)
  assert.match(
    powershell,
    /https:\/\/api\.acucompute\.com\/claude-acu-install\.ps1/
  )
  assert.match(unix, /ACU_API_KEY='sk-test-secret-123'/)
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
})

test('Windows Command Prompt wraps the PowerShell installer without changing it', () => {
  const powershell = buildPowerShellInstallCommand('codex', secret)
  const command = buildWindowsCommandPromptInstall(powershell)

  assert.match(command, /^powershell\.exe -NoProfile -ExecutionPolicy Bypass/)
  assert.match(command, /codex-acu-install\.ps1/)
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

test('preview display masks credentials while credentialed copy values remain usable', () => {
  const config = buildOpenClawConfig(secret)
  const displayed = maskCredentialText(config, secret)

  assert.equal(ACU_API_BASE_URL, 'https://api.acucompute.com/v1')
  assert.equal(ACU_DEFAULT_MODEL, 'acu-auto')
  assert.equal(ACU_MASKED_API_KEY, 'sk-••••••')
  assert.doesNotMatch(displayed, /sk-test-secret-123/)
  assert.match(displayed, /sk-••••••/)
})
