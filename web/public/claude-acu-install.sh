#!/usr/bin/env sh
set -eu

ACU_BASE_URL="https://eu.jerrypsy.top/acu"
ACU_HOME="${HOME}/.claude-acu"
ACU_BIN_DIR="${HOME}/.local/bin"
ACU_CREDENTIAL="${ACU_HOME}/credential"
ACU_LAUNCHER="${ACU_BIN_DIR}/claude-acu"

if ! command -v claude >/dev/null 2>&1; then
  printf '%s\n' "Claude Code is not installed; running the official Anthropic installer."
  curl -fsSL https://claude.ai/install.sh | sh
fi
command -v claude >/dev/null 2>&1 || {
  printf '%s\n' "Claude Code installation did not add 'claude' to PATH." >&2
  exit 1
}

printf '%s' "Paste your ACU API Key: "
if [ -r /dev/tty ]; then
  stty -echo </dev/tty
  IFS= read -r ACU_TOKEN </dev/tty
  stty echo </dev/tty
  printf '\n'
else
  printf '%s\n' "A terminal is required to read the API Key securely." >&2
  exit 1
fi
[ -n "${ACU_TOKEN}" ] || { printf '%s\n' "API Key cannot be empty." >&2; exit 1; }

umask 077
mkdir -p "${ACU_HOME}/config" "${ACU_BIN_DIR}"
printf '%s' "${ACU_TOKEN}" >"${ACU_CREDENTIAL}"
chmod 600 "${ACU_CREDENTIAL}"

cat >"${ACU_LAUNCHER}" <<'EOF'
#!/usr/bin/env sh
set -eu
ACU_HOME="${HOME}/.claude-acu"
ACU_TOKEN="$(cat "${ACU_HOME}/credential")"
export CLAUDE_CONFIG_DIR="${ACU_HOME}/config"
export ANTHROPIC_BASE_URL="https://eu.jerrypsy.top/acu"
export ANTHROPIC_AUTH_TOKEN="${ACU_TOKEN}"
export ANTHROPIC_CUSTOM_MODEL_OPTION="acu-auto"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="ACU Auto"
export ANTHROPIC_DEFAULT_OPUS_MODEL="acu-auto"
export ANTHROPIC_DEFAULT_SONNET_MODEL="acu-auto"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="acu-auto"
export CLAUDE_CODE_SUBAGENT_MODEL="acu-auto"
export CLAUDE_CODE_MAX_CONTEXT_TOKENS="272000"
exec claude --model acu-auto "$@"
EOF
chmod 700 "${ACU_LAUNCHER}"

VALIDATION_BODY='{"model":"acu-auto","max_tokens":32,"messages":[{"role":"user","content":"Return exactly CLAUDE_ACU_OK"}]}'
VALIDATION_RESPONSE="$(curl -fsS "${ACU_BASE_URL}/v1/messages" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -H "x-api-key: ${ACU_TOKEN}" \
  --data-binary "${VALIDATION_BODY}")"
printf '%s' "${VALIDATION_RESPONSE}" | grep -q 'CLAUDE_ACU_OK' || {
  printf '%s\n' "ACU Messages connection check did not return CLAUDE_ACU_OK." >&2
  exit 1
}

CLI_RESPONSE="$(${ACU_LAUNCHER} -p --max-turns 1 "Return exactly CLAUDE_ACU_OK")"
printf '%s' "${CLI_RESPONSE}" | grep -q 'CLAUDE_ACU_OK' || {
  printf '%s\n' "claude-acu verification failed." >&2
  exit 1
}

printf '%s\n' "claude-acu installed at ${ACU_LAUNCHER}"
case ":${PATH}:" in
  *":${ACU_BIN_DIR}:"*) ;;
  *) printf '%s\n' "Add ${ACU_BIN_DIR} to PATH, then run: claude-acu" ;;
esac
