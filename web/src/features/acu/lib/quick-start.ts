export const ACU_API_BASE_URL = 'https://api.acucompute.com/v1'
export const ACU_DEFAULT_MODEL = 'acu-auto'
export const ACU_MASKED_API_KEY = 'sk-••••••'

const ACU_INSTALL_BASE_URL = 'https://api.acucompute.com'
const ACU_DIRECT_INSTALL_BASE_URL = 'https://acu-api-direct.jerrypsy.top'
const CODEX_GITHUB_INSTALL_BASE_URL =
  'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu'
const CLAUDE_GITHUB_INSTALL_BASE_URL =
  'https://raw.githubusercontent.com/jerry0012009/acu-frontend/main/web/public'

export type AcuClient = 'codex' | 'claude'
export type AcuApiProtocol = 'responses' | 'messages'

export function normalizeApiKey(value: string): string {
  if (!value) return ACU_MASKED_API_KEY
  return value.startsWith('sk-') ? value : `sk-${value}`
}

export function maskCredentialText(value: string, apiKey: string): string {
  const normalizedKey = normalizeApiKey(apiKey)
  if (normalizedKey === ACU_MASKED_API_KEY) return value
  return value.replaceAll(normalizedKey, ACU_MASKED_API_KEY)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function powerShellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function installerName(client: AcuClient, extension: 'sh' | 'ps1'): string {
  return `${client}-acu-install.${extension}`
}

function githubInstallerUrl(
  client: AcuClient,
  extension: 'sh' | 'ps1'
): string {
  if (client === 'codex') {
    return `${CODEX_GITHUB_INSTALL_BASE_URL}/install.${extension}`
  }

  return `${CLAUDE_GITHUB_INSTALL_BASE_URL}/claude-acu-install.${extension}`
}

export function buildUnixInstallCommand(
  client: AcuClient,
  apiKey: string
): string {
  const installer = installerName(client, 'sh')
  return (
    `curl -fsSL ${ACU_INSTALL_BASE_URL}/${installer} | ` +
    `ACU_API_KEY=${shellQuote(normalizeApiKey(apiKey))} sh`
  )
}

export function buildUnixFallbackInstallCommand(
  client: AcuClient,
  apiKey: string
): string {
  const installer = installerName(client, 'sh')
  const key = shellQuote(normalizeApiKey(apiKey))
  return (
    `{ curl -fsSL ${ACU_INSTALL_BASE_URL}/${installer} || ` +
    `curl -fsSL ${ACU_DIRECT_INSTALL_BASE_URL}/${installer} || ` +
    `curl -fsSL ${githubInstallerUrl(client, 'sh')}; } ` +
    `| ACU_API_KEY=${key} sh`
  )
}

export function buildPowerShellInstallCommand(
  client: AcuClient,
  apiKey: string
): string {
  const installer = installerName(client, 'ps1')
  return (
    `$env:ACU_API_KEY=${powerShellQuote(normalizeApiKey(apiKey))}; ` +
    `irm '${ACU_INSTALL_BASE_URL}/${installer}' | iex`
  )
}

export function buildPowerShellFallbackInstallCommand(
  client: AcuClient,
  apiKey: string
): string {
  const installer = installerName(client, 'ps1')
  const key = powerShellQuote(normalizeApiKey(apiKey))
  return (
    `$env:ACU_API_KEY=${key}; ` +
    `try { irm '${ACU_INSTALL_BASE_URL}/${installer}' | iex } ` +
    `catch { try { irm '${ACU_DIRECT_INSTALL_BASE_URL}/${installer}' | iex } ` +
    `catch { irm '${githubInstallerUrl(client, 'ps1')}' | iex } }`
  )
}

export function buildWindowsCommandPromptInstall(
  powerShellCommand: string
): string {
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${powerShellCommand}"`
}

export function getLaunchCommand(client: AcuClient): string {
  return client === 'codex' ? 'codex-acu' : 'claude-acu'
}

export function buildManualConfig(client: AcuClient, apiKey: string): string {
  const key = normalizeApiKey(apiKey)
  if (client === 'codex') {
    return `export ACU_API_KEY=${shellQuote(key)}

model = "acu-auto"
model_provider = "acu-founder-alpha"
model_reasoning_effort = "medium"

[model_providers.acu-founder-alpha]
name = "ACU Router Founder Alpha"
base_url = "${ACU_API_BASE_URL}"
env_key = "ACU_API_KEY"
wire_api = "responses"`
  }

  return `export CLAUDE_CONFIG_DIR="\${HOME}/.claude-acu/config"
export ANTHROPIC_BASE_URL="https://api.acucompute.com"
export ANTHROPIC_AUTH_TOKEN=${shellQuote(key)}
export ANTHROPIC_CUSTOM_MODEL_OPTION="acu-auto"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-4-8"
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-5"
export ANTHROPIC_DEFAULT_FABLE_MODEL="claude-fable-5"

claude --model acu-auto`
}

export function getProtocolEndpoint(protocol: AcuApiProtocol): string {
  if (protocol === 'responses') return '/v1/responses'
  if (protocol === 'messages') return '/v1/messages'
  return '/v1/chat/completions'
}

export function buildApiCurl(protocol: AcuApiProtocol, apiKey: string): string {
  const key = normalizeApiKey(apiKey)

  if (protocol === 'messages') {
    return `curl -sS https://api.acucompute.com/v1/messages \\
  -H "x-api-key: ${key}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"acu-auto","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'`
  }

  return `curl -sS https://api.acucompute.com/v1/responses \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"acu-auto","input":"Hello","max_output_tokens":64}'`
}

export function buildOpenClawConfig(apiKey: string): string {
  return `{
  "models": {
    "providers": {
      "acu": {
        "baseUrl": "${ACU_API_BASE_URL}",
        "apiKey": "${normalizeApiKey(apiKey)}",
        "api": "openai-responses",
        "models": [{
          "id": "${ACU_DEFAULT_MODEL}",
          "name": "ACU Auto",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 272000,
          "maxTokens": 32000
        }]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "acu/${ACU_DEFAULT_MODEL}"
      }
    }
  }
}`
}

export function buildHermesConfig(apiKey: string): string {
  return `model:
  default: ${ACU_DEFAULT_MODEL}
  provider: acu
  api_mode: codex_responses

custom_providers:
  - name: acu
    base_url: ${ACU_API_BASE_URL}
    api_key: ${normalizeApiKey(apiKey)}
    api_mode: codex_responses
    model: ${ACU_DEFAULT_MODEL}

display:
  streaming: true`
}
