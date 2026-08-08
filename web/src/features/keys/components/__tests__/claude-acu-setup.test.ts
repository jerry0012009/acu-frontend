import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const shellInstaller = readFileSync(
  new URL('../../../../../public/claude-acu-install.sh', import.meta.url),
  'utf8'
)
const powerShellInstaller = readFileSync(
  new URL('../../../../../public/claude-acu-install.ps1', import.meta.url),
  'utf8'
)

test('Unix installer is syntactically valid and keeps the credential local', () => {
  const installerPath = new URL(
    '../../../../../public/claude-acu-install.sh',
    import.meta.url
  )
  execFileSync('sh', ['-n', installerPath.pathname])
  assert.match(shellInstaller, /chmod 600/)
  assert.match(shellInstaller, /CLAUDE_CONFIG_DIR/)
  assert.match(shellInstaller, /ANTHROPIC_AUTH_TOKEN/)
  assert.match(shellInstaller, /https:\/\/eu\.jerrypsy\.top\/acu/)
  assert.doesNotMatch(shellInstaller, /:8443/)
  assert.match(shellInstaller, /claude --model acu-auto/)
  assert.doesNotMatch(shellInstaller, /\?[^\n]*ACU_TOKEN/)
})

test('PowerShell installer uses a private config and never puts the key in a URL', () => {
  assert.match(powerShellInstaller, /Read-Host .* -AsSecureString/)
  assert.match(powerShellInstaller, /icacls/)
  assert.match(powerShellInstaller, /CLAUDE_CONFIG_DIR/)
  assert.match(powerShellInstaller, /ANTHROPIC_AUTH_TOKEN/)
  assert.match(powerShellInstaller, /https:\/\/eu\.jerrypsy\.top\/acu/)
  assert.doesNotMatch(powerShellInstaller, /:8443/)
  assert.match(powerShellInstaller, /claude --model acu-auto/)
  assert.doesNotMatch(powerShellInstaller, /\?[^\n]*\$Token/)
})
