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
const setupSource = readFileSync(
  new URL('../claude-acu-setup.tsx', import.meta.url),
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
  assert.match(shellInstaller, /CLAUDE_CODE_MAX_CONTEXT_TOKENS="272000"/)
  assert.match(shellInstaller, /registry\.npmmirror\.com/)
  assert.match(shellInstaller, /native-claude-path/)
  assert.match(shellInstaller, /acu-api-direct\.jerrypsy\.top/)
  assert.match(shellInstaller, /https:\/\/eu\.jerrypsy\.top\/acu/)
  assert.doesNotMatch(shellInstaller, /:8443/)
  assert.match(shellInstaller, /ACU_NATIVE_PATH_FILE=.*native-claude-path/)
  assert.match(shellInstaller, /exec "\$NATIVE_CLAUDE" --model acu-auto/)
  assert.match(shellInstaller, /register_path\(\)/)
  assert.doesNotMatch(shellInstaller, /\?[^\n]*ACU_TOKEN/)
})

test('PowerShell installer uses a private config and never puts the key in a URL', () => {
  assert.match(powerShellInstaller, /Read-Host .* -AsSecureString/)
  assert.match(powerShellInstaller, /\$env:ACU_API_KEY/)
  assert.match(powerShellInstaller, /icacls/)
  assert.match(powerShellInstaller, /CLAUDE_CONFIG_DIR/)
  assert.match(powerShellInstaller, /ANTHROPIC_AUTH_TOKEN/)
  assert.match(powerShellInstaller, /CLAUDE_CODE_MAX_CONTEXT_TOKENS = '272000'/)
  assert.match(powerShellInstaller, /registry\.npmmirror\.com/)
  assert.match(powerShellInstaller, /native-claude-path/)
  assert.match(powerShellInstaller, /https:\/\/eu\.jerrypsy\.top\/acu/)
  assert.doesNotMatch(powerShellInstaller, /:8443/)
  assert.match(powerShellInstaller, /\$NativeClaude.*native-claude-path/)
  assert.match(powerShellInstaller, /& \$NativeClaude --model acu-auto/)
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
  assert.match(codexShellInstaller, /https:\/\/eu\.jerrypsy\.top\/acu\/v1/)
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
  assert.match(
    codexPowerShellInstaller,
    /\$NativeBin = Join-Path \$AcuHome 'bin'/
  )
  assert.match(codexPowerShellInstaller, /\$env:ACU_API_KEY/)
  assert.match(codexPowerShellInstaller, /CODEX_ACU_OK/)
})

test('ACU setup commands include the resolved token and regional installer sources', () => {
  assert.match(setupSource, /normalizeKey\(tokenKey\)/)
  assert.match(setupSource, /ACU_API_KEY=\$\{key\} sh/)
  assert.match(setupSource, /\$env:ACU_API_KEY=\$\{key\}/)
  assert.match(setupSource, /eu\.jerrypsy\.top\/acu\/codex-acu-install\.sh/)
  assert.match(
    setupSource,
    /acu-api-direct\.jerrypsy\.top\/codex-acu-install\.sh/
  )
  assert.match(setupSource, /eu\.jerrypsy\.top\/acu\/claude-acu-install\.sh/)
  assert.match(
    setupSource,
    /acu-api-direct\.jerrypsy\.top\/claude-acu-install\.sh/
  )
  assert.match(setupSource, /raw\.githubusercontent\.com/)
})

test('Claude Unix installer can complete through a private npm prefix and ACU endpoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-acu-install-'))
  const fakeBin = join(root, 'bin')
  const npmLog = join(root, 'npm.log')
  const acuHome = join(root, 'acu-home')
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
        CLAUDE_ACU_BIN_DIR: join(root, 'install-bin'),
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
    'https://eu.jerrypsy.top/acu\n'
  )
  assert.match(
    readFileSync(npmLog, 'utf8'),
    /@anthropic-ai\/claude-code@latest/
  )
  assert.match(
    readFileSync(npmLog, 'utf8'),
    /registry=https:\/\/registry\.npmjs\.org/
  )
})
