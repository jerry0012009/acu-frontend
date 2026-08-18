import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const shellInstaller = readFileSync(
  new URL('../../../../../public/claude-acu-install.sh', import.meta.url),
  'utf8'
)
const powerShellInstaller = readFileSync(
  new URL('../../../../../public/claude-acu-install.ps1', import.meta.url),
  'utf8'
)
const codexShellInstaller = readFileSync(
  new URL('../../../../../public/codex-acu-install.sh', import.meta.url),
  'utf8'
)
const codexPowerShellInstaller = readFileSync(
  new URL('../../../../../public/codex-acu-install.ps1', import.meta.url),
  'utf8'
)
const codexLauncher = readFileSync(
  new URL('../../../../../public/codex-acu', import.meta.url),
  'utf8'
)
const codexModelCatalog = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../public/codex-acu-model-catalog.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  models: Array<{
    slug: string
    supported_reasoning_levels: Array<{ effort: string }>
  }>
}
const quickStartSource = readFileSync(
  new URL('../../../acu/lib/quick-start.ts', import.meta.url),
  'utf8'
)
const quickStartComponentSource = readFileSync(
  new URL('../../../acu/components/acu-quick-start.tsx', import.meta.url),
  'utf8'
)
const ccSwitchSource = readFileSync(
  new URL('../dialogs/cc-switch-dialog.tsx', import.meta.url),
  'utf8'
)

test('Unix installer is syntactically valid and keeps the credential local', () => {
  const installerPath = new URL(
    '../../../../../public/claude-acu-install.sh',
    import.meta.url
  )
  execFileSync('sh', ['-n', installerPath.pathname])
  assert.match(shellInstaller, /chmod 600/)
  assert.match(shellInstaller, /ACU_API_KEY/)
  assert.match(shellInstaller, /CLAUDE_CONFIG_DIR/)
  assert.match(shellInstaller, /ANTHROPIC_AUTH_TOKEN/)
  assert.doesNotMatch(shellInstaller, /CLAUDE_CODE_MAX_CONTEXT_TOKENS/)
  assert.match(shellInstaller, /registry\.npmmirror\.com/)
  assert.match(shellInstaller, /native-claude-path/)
  assert.match(shellInstaller, /acu-api-direct\.jerrypsy\.top/)
  assert.match(shellInstaller, /https:\/\/api\.acucompute\.com/)
  assert.doesNotMatch(shellInstaller, /:8443/)
  assert.match(shellInstaller, /ACU_NATIVE_PATH_FILE=.*native-claude-path/)
  assert.match(shellInstaller, /"availableModels"/)
  assert.match(shellInstaller, /ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-4-8"/)
  assert.match(
    shellInstaller,
    /ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-5"/
  )
  assert.match(shellInstaller, /ANTHROPIC_DEFAULT_FABLE_MODEL="claude-fable-5"/)
  assert.match(
    shellInstaller,
    /exec "\$NATIVE_CLAUDE" --settings "\$MODEL_SETTINGS" --model acu-auto/
  )
  assert.match(shellInstaller, /unsupported Claude ACU model/)
  assert.match(shellInstaller, /unset CLAUDE_CODE_SUBAGENT_MODEL/)
  assert.match(shellInstaller, /CLAUDE_ACU_UPDATE_CLAUDE/)
  assert.match(shellInstaller, /CLAUDE_ACU_CLI_VERIFY/)
  assert.match(shellInstaller, /CLAUDE_ACU_VERIFY_TIMEOUT_SEC/)
  assert.match(shellInstaller, /register_path\(\)/)
  assert.doesNotMatch(shellInstaller, /\?[^\n]*ACU_TOKEN/)
})

test('PowerShell installer uses a private config and never puts the key in a URL', () => {
  assert.match(powerShellInstaller, /Read-Host .* -AsSecureString/)
  assert.match(powerShellInstaller, /\$env:ACU_API_KEY/)
  assert.match(powerShellInstaller, /icacls/)
  assert.match(powerShellInstaller, /CLAUDE_CONFIG_DIR/)
  assert.match(powerShellInstaller, /ANTHROPIC_AUTH_TOKEN/)
  assert.doesNotMatch(powerShellInstaller, /CLAUDE_CODE_MAX_CONTEXT_TOKENS/)
  assert.match(powerShellInstaller, /registry\.npmmirror\.com/)
  assert.match(powerShellInstaller, /@\(.*'npm\.cmd'.*'npm\.exe'.*'npm'.*\)/)
  assert.match(powerShellInstaller, /& \$npmCommand @npmArguments/)
  assert.match(powerShellInstaller, /native-claude-path/)
  assert.match(powerShellInstaller, /https:\/\/api\.acucompute\.com/)
  assert.doesNotMatch(powerShellInstaller, /:8443/)
  assert.match(powerShellInstaller, /\$NativeClaude.*native-claude-path/)
  assert.match(powerShellInstaller, /acu-model-settings\.json/)
  assert.match(powerShellInstaller, /Join-Path \$AcuHome 'config'\), \$AcuBin/)
  assert.match(
    powerShellInstaller,
    /\$env:ANTHROPIC_DEFAULT_OPUS_MODEL = 'claude-opus-4-8'/
  )
  assert.match(
    powerShellInstaller,
    /\$env:ANTHROPIC_DEFAULT_SONNET_MODEL = 'claude-sonnet-5'/
  )
  assert.match(
    powerShellInstaller,
    /\$env:ANTHROPIC_DEFAULT_FABLE_MODEL = 'claude-fable-5'/
  )
  assert.match(powerShellInstaller, /\$nativeArgs = @\('--settings'/)
  assert.match(powerShellInstaller, /unsupported Claude ACU model/)
  assert.match(
    powerShellInstaller,
    /Remove-Item Env:CLAUDE_CODE_SUBAGENT_MODEL/
  )
  assert.match(powerShellInstaller, /CLAUDE_ACU_UPDATE_CLAUDE/)
  assert.match(powerShellInstaller, /CLAUDE_ACU_CLI_VERIFY/)
  assert.match(powerShellInstaller, /CLAUDE_ACU_VERIFY_TIMEOUT_SEC/)
  assert.match(powerShellInstaller, /Start-Job/)
  assert.match(powerShellInstaller, /SetEnvironmentVariable\('Path'/)
  assert.doesNotMatch(powerShellInstaller, /\?[^\n]*\$Token/)
})

test('Codex installers install the latest CLI with China and overseas fallbacks', () => {
  const installerPath = new URL(
    '../../../../../public/codex-acu-install.sh',
    import.meta.url
  )
  execFileSync('sh', ['-n', installerPath.pathname])
  assert.match(
    codexShellInstaller,
    /https:\/\/chatgpt\.com\/codex\/install\.sh/
  )
  assert.match(codexShellInstaller, /https:\/\/registry\.npmjs\.org/)
  assert.match(codexShellInstaller, /https:\/\/registry\.npmmirror\.com/)
  assert.match(codexShellInstaller, /codex-releases/)
  assert.match(codexShellInstaller, /native_bin_dir="\$acu_home\/bin"/)
  assert.match(
    codexShellInstaller,
    /https:\/\/acu-api-direct\.jerrypsy\.top\/v1/
  )
  assert.match(codexShellInstaller, /https:\/\/api\.acucompute\.com\/v1/)
  assert.match(codexShellInstaller, /ACU_API_KEY/)
  assert.match(codexShellInstaller, /chmod 600/)
  assert.match(codexShellInstaller, /CODEX_ACU_OK/)
  assert.match(codexShellInstaller, /register_path\(\)/)
  assert.doesNotMatch(
    codexShellInstaller,
    /\?[^\n]*(?:api[_-]?key|ACU_API_KEY)/i
  )

  assert.match(
    codexPowerShellInstaller,
    /https:\/\/chatgpt\.com\/codex\/install\.ps1/
  )
  assert.match(codexPowerShellInstaller, /registry\.npmmirror\.com/)
  assert.match(codexPowerShellInstaller, /codex-releases/)
  assert.match(codexPowerShellInstaller, /'npm\.cmd'.*'npm\.exe'.*'npm'/)
  assert.match(
    codexPowerShellInstaller,
    /Join-Path \$AcuHome 'npm\\codex\.cmd'/
  )
  assert.match(
    codexPowerShellInstaller,
    /\$NativeBin = Join-Path \$AcuHome 'bin'/
  )
  assert.match(codexPowerShellInstaller, /\$env:ACU_API_KEY/)
  assert.match(codexPowerShellInstaller, /CODEX_ACU_CLI_VERIFY/)
  assert.match(codexPowerShellInstaller, /CODEX_ACU_OK/)
  assert.match(
    codexLauncher,
    /acu-auto\|gpt-5\.6-luna\|gpt-5\.6-terra\|gpt-5\.6-sol/
  )
  assert.match(codexLauncher, /model=\*\|model_provider=\*/)
  assert.match(codexLauncher, /model_provider="acu-founder-alpha"/)
  assert.match(codexLauncher, /model_reasoning_effort="medium"/)
  assert.deepEqual(
    codexModelCatalog.models.map(({ slug }) => slug),
    ['acu-auto', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']
  )
  assert.deepEqual(
    codexModelCatalog.models.map(({ supported_reasoning_levels }) =>
      supported_reasoning_levels.map(({ effort }) => effort)
    ),
    [
      ['low', 'medium', 'high', 'xhigh'],
      ['low', 'medium', 'high', 'max'],
      ['low', 'medium', 'high', 'max'],
      ['low', 'medium', 'high', 'xhigh'],
    ]
  )
})

test('ACU setup commands include the resolved token and regional installer sources', () => {
  assert.match(quickStartSource, /normalizeApiKey\(apiKey\)/)
  assert.match(quickStartSource, /ACU_API_KEY=\$\{shellQuote/)
  assert.match(quickStartSource, /\$env:ACU_API_KEY=\$\{powerShellQuote/)
  assert.match(quickStartSource, /buildWindowsCommandPromptInstall/)
  assert.match(
    quickStartSource,
    /powershell\.exe -NoProfile -ExecutionPolicy Bypass -Command/
  )
  assert.match(quickStartSource, /ACU_INSTALL_BASE_URL/)
  assert.match(quickStartSource, /installerName\(client, 'sh'\)/)
  assert.match(quickStartSource, /ACU_DIRECT_INSTALL_BASE_URL/)
  assert.match(quickStartSource, /installerName\(client, 'ps1'\)/)
  assert.match(quickStartSource, /githubInstallerUrl\(client/)
  assert.match(quickStartSource, /raw\.githubusercontent\.com/)
})

test('ACU Quick Start and CC Switch expose no Gemini user entry', () => {
  assert.doesNotMatch(quickStartComponentSource, /Gemini/)
  assert.doesNotMatch(ccSwitchSource, /gemini/i)
})

test('ACU Quick Start keeps Chat Completions hidden and exposes verified Hermes configuration', () => {
  assert.doesNotMatch(quickStartComponentSource, /Chat Completions/)
  assert.match(quickStartComponentSource, /Hermes/)
  assert.match(quickStartSource, /buildHermesConfig/)
  assert.match(quickStartSource, /custom_providers/)
  assert.match(quickStartSource, /api_mode: codex_responses/)
})

test('CC Switch has a dedicated quick-start tab with model mapping guidance', () => {
  assert.match(quickStartComponentSource, /value='ccswitch'/)
  assert.match(quickStartComponentSource, /Advanced options · Model mapping/)
  assert.match(quickStartComponentSource, /Menu display name/)
  assert.match(quickStartComponentSource, /Actual request model/)
  assert.match(quickStartComponentSource, /Context window/)
  assert.match(quickStartComponentSource, /model_catalog_json/)
  assert.match(quickStartSource, /CC_SWITCH_MODEL_MAPPINGS/)
})

test('copying an API key opens the CC Switch setup guidance', () => {
  const rowActionsSource = readFileSync(
    new URL('../data-table-row-actions.tsx', import.meta.url),
    'utf8'
  )
  const providerSource = readFileSync(
    new URL('../api-keys-provider.tsx', import.meta.url),
    'utf8'
  )
  assert.match(rowActionsSource, /setAcuSetupInitialTab\('ccswitch'\)/)
  assert.match(rowActionsSource, /setOpen\('acu-setup'\)/)
  assert.match(providerSource, /acuSetupInitialTab/)
})

test('Claude Unix installer can complete through a private npm prefix and ACU endpoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-acu-install-'))
  const fakeBin = join(root, 'bin')
  const npmLog = join(root, 'npm.log')
  const claudeLog = join(root, 'claude.log')
  const acuHome = join(root, 'acu-home')
  const installBin = join(root, 'install-bin')
  mkdirSync(fakeBin, { recursive: true })

  const fakeCurl = join(fakeBin, 'curl')
  writeFileSync(
    fakeCurl,
    `#!/bin/sh
case "$*" in
  */v1/messages*) printf '%s\\n' '{"content":[{"text":"CLAUDE_ACU_OK"}]}' ;;
  *) exit 22 ;;
esac
`
  )
  chmodSync(fakeCurl, 0o755)

  const oldSystemClaude = join(fakeBin, 'claude')
  writeFileSync(
    oldSystemClaude,
    `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' '2.0.54 (Claude Code)'
else
  printf '%s\\n' 'OLD_SYSTEM_CLAUDE'
fi
`
  )
  chmodSync(oldSystemClaude, 0o755)

  const fakeNpm = join(fakeBin, 'npm')
  writeFileSync(
    fakeNpm,
    `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "${npmLog}"
prefix=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix) prefix="$2"; shift 2 ;;
    *) shift ;;
  esac
done
mkdir -p "$prefix/bin"
cat > "$prefix/bin/claude" <<'EOF'
#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' 'Claude Code 1.0.0'
else
  printf '%s\\n' "$ANTHROPIC_BASE_URL|$*" >> "${claudeLog}"
  printf '%s\\n' 'CLAUDE_ACU_OK'
fi
EOF
chmod 755 "$prefix/bin/claude"
`
  )
  chmodSync(fakeNpm, 0o755)

  const result = spawnSync(
    'sh',
    [
      new URL('../../../../../public/claude-acu-install.sh', import.meta.url)
        .pathname,
    ],
    {
      env: {
        ...process.env,
        PATH: `${fakeBin}:/usr/bin:/bin`,
        HOME: root,
        ACU_API_KEY: 'sk-claude-test',
        CLAUDE_ACU_HOME: acuHome,
        CLAUDE_ACU_BIN_DIR: installBin,
      },
      encoding: 'utf8',
    }
  )

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(join(acuHome, 'credential'), 'utf8'),
    'sk-claude-test\n'
  )
  assert.equal(
    readFileSync(join(acuHome, 'base-url'), 'utf8'),
    'https://api.acucompute.com\n'
  )
  assert.equal(
    readFileSync(join(acuHome, 'native-claude-path'), 'utf8'),
    `${join(acuHome, 'npm/bin/claude')}\n`
  )
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(acuHome, 'config', 'acu-model-settings.json'), 'utf8')
    ),
    {
      availableModels: [
        'acu-auto',
        'claude-opus-4-8',
        'claude-sonnet-5',
        'claude-fable-5',
      ],
    }
  )
  assert.match(
    readFileSync(npmLog, 'utf8'),
    /@anthropic-ai\/claude-code@latest/
  )
  assert.match(
    readFileSync(npmLog, 'utf8'),
    /registry=https:\/\/registry\.npmjs\.org/
  )

  const launcher = join(installBin, 'claude-acu')
  const launcherEnv = {
    ...process.env,
    HOME: root,
    CLAUDE_ACU_HOME: acuHome,
  }
  const defaultLaunch = spawnSync(launcher, ['-p', 'test task'], {
    env: launcherEnv,
    encoding: 'utf8',
  })
  assert.equal(defaultLaunch.status, 0, defaultLaunch.stderr)
  const explicitLaunch = spawnSync(
    launcher,
    ['--model', 'claude-opus-4-8', '-p', 'test task'],
    {
      env: launcherEnv,
      encoding: 'utf8',
    }
  )
  assert.equal(explicitLaunch.status, 0, explicitLaunch.stderr)
  const invalidLaunch = spawnSync(launcher, ['--model', 'claude-unknown'], {
    env: launcherEnv,
    encoding: 'utf8',
  })
  assert.equal(invalidLaunch.status, 2)
  assert.match(invalidLaunch.stderr, /unsupported Claude ACU model/)

  const claudeCalls = readFileSync(claudeLog, 'utf8')
  const settingsPath = join(acuHome, 'config', 'acu-model-settings.json')
  assert.match(
    claudeCalls,
    new RegExp(
      `https://api\\.acucompute\\.com\\|--settings ${settingsPath} --model acu-auto -p test task`
    )
  )
  assert.match(
    claudeCalls,
    new RegExp(
      `https://api\\.acucompute\\.com\\|--settings ${settingsPath} --model claude-opus-4-8 -p test task`
    )
  )
  assert.doesNotMatch(claudeCalls, /sk-claude-test/)
})

test('Claude Unix installer upgrades old settings without replacing credential or Base URL', () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-acu-upgrade-'))
  const fakeBin = join(root, 'bin')
  const acuHome = join(root, 'acu-home')
  const installBin = join(root, 'install-bin')
  const settingsDir = join(acuHome, 'config')
  const nativeConfigDir = join(root, '.claude')
  mkdirSync(fakeBin, { recursive: true })
  mkdirSync(settingsDir, { recursive: true })
  mkdirSync(installBin, { recursive: true })
  mkdirSync(nativeConfigDir, { recursive: true })
  writeFileSync(join(root, '.profile'), '')
  writeFileSync(join(nativeConfigDir, 'settings.json'), '{"native":true}\n')

  const fakeClaude = join(fakeBin, 'claude')
  writeFileSync(
    fakeClaude,
    `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' '2.1.226 (Claude Code)'
  exit 0
fi
printf '%s\\n' "$ANTHROPIC_BASE_URL|$*"
`
  )
  chmodSync(fakeClaude, 0o755)

  const oldCredential = 'sk-existing-claude'
  const oldBaseUrl = 'https://existing.messages.example'
  writeFileSync(join(acuHome, 'credential'), oldCredential)
  writeFileSync(join(acuHome, 'base-url'), oldBaseUrl)
  writeFileSync(
    join(settingsDir, 'acu-model-settings.json'),
    '{"availableModels":["acu-auto"]}\n'
  )
  writeFileSync(
    join(installBin, 'claude-acu'),
    'ANTHROPIC_DEFAULT_HAIKU_MODEL="acu-auto"\n'
  )

  const env = {
    ...process.env,
    PATH: `${fakeBin}:/usr/bin:/bin`,
    HOME: root,
    CLAUDE_ACU_HOME: acuHome,
    CLAUDE_ACU_BIN_DIR: installBin,
    CLAUDE_ACU_UPDATE_CLAUDE: '0',
    CLAUDE_ACU_PREFER_NPM: '0',
    CLAUDE_ACU_LIVE_VERIFY: '0',
    CLAUDE_ACU_CLI_VERIFY: '0',
    ACU_API_KEY: '',
    SHELL: '/bin/sh',
  }
  const installerPath = new URL(
    '../../../../../public/claude-acu-install.sh',
    import.meta.url
  ).pathname
  const runInstaller = () =>
    spawnSync('sh', [installerPath], {
      env,
      encoding: 'utf8',
    })

  const first = runInstaller()
  assert.equal(first.status, 0, first.stderr)
  const firstLauncher = readFileSync(join(installBin, 'claude-acu'), 'utf8')
  const firstSettings = readFileSync(
    join(settingsDir, 'acu-model-settings.json'),
    'utf8'
  )
  const firstNativePath = readFileSync(
    join(acuHome, 'native-claude-path'),
    'utf8'
  )
  assert.equal(readFileSync(join(acuHome, 'credential'), 'utf8'), oldCredential)
  assert.equal(
    readFileSync(join(acuHome, 'base-url'), 'utf8'),
    `${oldBaseUrl}\n`
  )
  assert.deepEqual(JSON.parse(firstSettings), {
    availableModels: [
      'acu-auto',
      'claude-opus-4-8',
      'claude-sonnet-5',
      'claude-fable-5',
    ],
  })
  assert.doesNotMatch(firstSettings, /haiku/i)
  assert.match(firstLauncher, /unset ANTHROPIC_DEFAULT_HAIKU_MODEL/)
  assert.doesNotMatch(firstLauncher, /ANTHROPIC_DEFAULT_HAIKU_MODEL="acu-auto"/)
  assert.equal(
    readFileSync(join(nativeConfigDir, 'settings.json'), 'utf8'),
    '{"native":true}\n'
  )

  const second = runInstaller()
  assert.equal(second.status, 0, second.stderr)
  assert.equal(
    readFileSync(join(installBin, 'claude-acu'), 'utf8'),
    firstLauncher
  )
  assert.equal(
    readFileSync(join(settingsDir, 'acu-model-settings.json'), 'utf8'),
    firstSettings
  )
  assert.equal(
    readFileSync(join(acuHome, 'native-claude-path'), 'utf8'),
    firstNativePath
  )
  assert.equal(readFileSync(join(acuHome, 'credential'), 'utf8'), oldCredential)
  assert.equal(
    readFileSync(join(root, '.profile'), 'utf8').split(installBin).length - 1,
    1
  )

  const launcher = join(installBin, 'claude-acu')
  const explicit = spawnSync(
    launcher,
    ['--model', 'claude-fable-5', '-p', 'test task'],
    {
      env,
      encoding: 'utf8',
    }
  )
  assert.equal(explicit.status, 0, explicit.stderr)
  assert.match(explicit.stdout, /--model claude-fable-5/)
})
