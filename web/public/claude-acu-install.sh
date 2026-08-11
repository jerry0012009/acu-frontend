#!/usr/bin/env sh
set -eu

ACU_PUBLIC_BASE_URL="https://api.acucompute.com"
ACU_DIRECT_BASE_URL="https://acu-api-direct.jerrypsy.top"
ACU_HOME=${CLAUDE_ACU_HOME:-"${HOME}/.claude-acu"}
ACU_BIN_DIR=${CLAUDE_ACU_BIN_DIR:-"${HOME}/.local/bin"}
ACU_CREDENTIAL="${ACU_HOME}/credential"
ACU_BASE_URL_FILE="${ACU_HOME}/base-url"
ACU_NATIVE_PATH_FILE="${ACU_HOME}/native-claude-path"
ACU_MODEL_SETTINGS_FILE="${ACU_HOME}/config/acu-model-settings.json"
ACU_LAUNCHER="${ACU_BIN_DIR}/claude-acu"
PREFER_NPM=${CLAUDE_ACU_PREFER_NPM:-1}
UPDATE_CLAUDE=${CLAUDE_ACU_UPDATE_CLAUDE:-1}
LIVE_VERIFY=${CLAUDE_ACU_LIVE_VERIFY:-1}
CLI_VERIFY=${CLAUDE_ACU_CLI_VERIFY:-0}
VERIFY_TIMEOUT_SEC=${CLAUDE_ACU_VERIFY_TIMEOUT_SEC:-45}

download_file() {
  url=$1
  output=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 10 --max-time 300 "$url" -o "$output"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -T 300 -O "$output" "$url"
    return
  fi
  printf '%s\n' "curl or wget is required." >&2
  return 1
}

usable_claude() {
  candidate=$1
  [ -x "$candidate" ] || return 1
  "$candidate" --version >/dev/null 2>&1
}

find_managed_claude() {
  for candidate in \
    "${ACU_HOME}/npm/bin/claude" \
    "${ACU_HOME}/npm/claude"; do
    if usable_claude "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  return 1
}

find_system_claude() {
  for candidate in \
    "${HOME}/.local/bin/claude" \
    "${HOME}/.claude/bin/claude" \
    "$(command -v claude 2>/dev/null || true)"; do
    if [ -n "$candidate" ] && usable_claude "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  return 1
}

install_claude_npm() {
  command -v npm >/dev/null 2>&1 || return 1
  npm_prefix="${ACU_HOME}/npm"
  mkdir -p "$npm_prefix"
  for registry in \
    "${CLAUDE_ACU_NPM_REGISTRY:-}" \
    "https://registry.npmjs.org" \
    "https://registry.npmmirror.com"; do
    [ -n "$registry" ] || continue
    printf '%s\n' "Installing Claude Code from $registry..."
    if npm install --global --prefix "$npm_prefix" \
      "@anthropic-ai/claude-code@${CLAUDE_ACU_CLAUDE_VERSION:-latest}" \
      --registry="$registry" --fetch-retries=1 --fetch-timeout=60000 &&
      find_managed_claude >/dev/null; then
      return
    fi
  done
  return 1
}

install_claude_official() {
  installer=$1
  printf '%s\n' "Installing Claude Code with the official Anthropic installer..."
  download_file "https://claude.ai/install.sh" "$installer" || return 1
  sh "$installer"
}

validate_messages() {
  endpoint=$1
  token=$2
  body='{"model":"acu-auto","max_tokens":32,"messages":[{"role":"user","content":"Return exactly CLAUDE_ACU_OK"}]}'
  curl -fsS --connect-timeout 8 --max-time 90 \
    "${endpoint}/v1/messages" \
    -H "content-type: application/json" \
    -H "anthropic-version: 2023-06-01" \
    -H "x-api-key: ${token}" \
    --data-binary "$body"
}

register_path() {
  path_export="export PATH=\"${ACU_BIN_DIR}:\$PATH\""
  shell_name=$(basename "${SHELL:-sh}")
  profiles=
  case "$shell_name" in
    zsh) profiles="$HOME/.zshrc" ;;
    bash) profiles="$HOME/.bashrc" ;;
    *) profiles="$HOME/.profile" ;;
  esac
  for profile in $profiles; do
    if [ ! -f "$profile" ]; then
      printf '%s\n' "$path_export" > "$profile"
    elif ! grep -Fq "$ACU_BIN_DIR" "$profile"; then
      printf '\n%s\n' "$path_export" >> "$profile"
    fi
  done
}

existing_token=
if [ -s "$ACU_CREDENTIAL" ]; then
  existing_token=$(sed -n '1p' "$ACU_CREDENTIAL")
fi
ACU_TOKEN=${ACU_API_KEY:-$existing_token}
if [ -z "$ACU_TOKEN" ]; then
  printf '%s' "Paste your ACU API Key: "
  if [ -r /dev/tty ]; then
    stty -echo </dev/tty
    IFS= read -r ACU_TOKEN </dev/tty
    stty echo </dev/tty
    printf '\n'
  else
    printf '%s\n' "Set ACU_API_KEY or run the installer from a terminal." >&2
    exit 1
  fi
fi
case "$ACU_TOKEN" in
  sk-?*) ;;
  *) printf '%s\n' "API Key must start with sk-." >&2; exit 1 ;;
esac
case "$ACU_TOKEN" in
  *'
'*) printf '%s\n' "API Key must be a single line." >&2; exit 1 ;;
esac

mkdir -p "${ACU_HOME}/config" "$ACU_BIN_DIR"
chmod 700 "$ACU_HOME"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/claude-acu-install.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

native_claude=$(find_managed_claude || true)
updated_claude=0
npm_attempted=0
if [ "$UPDATE_CLAUDE" != "0" ]; then
  if [ "$PREFER_NPM" != "0" ]; then
    npm_attempted=1
    if install_claude_npm; then
      native_claude=$(find_managed_claude || true)
      [ -n "$native_claude" ] && updated_claude=1
    fi
  fi
  if [ "$updated_claude" = "0" ]; then
    native_claude=$(find_system_claude || true)
    [ -n "$native_claude" ] && updated_claude=1
  fi
fi
if [ -z "$native_claude" ]; then
  native_claude=$(find_system_claude || true)
fi
if [ -z "$native_claude" ] && [ "$PREFER_NPM" != "0" ] && [ "$npm_attempted" = "0" ]; then
  install_claude_npm || true
  native_claude=$(find_managed_claude || true)
fi
if [ -z "$native_claude" ]; then
  install_claude_official "$tmp_dir/claude-install.sh" || true
  native_claude=$(find_system_claude || true)
fi
[ -n "$native_claude" ] || {
  printf '%s\n' "Unable to install Claude Code from npm mirrors or Anthropic." >&2
  exit 1
}

validation_response=
acu_base_url=
existing_base_url=
if [ -s "$ACU_BASE_URL_FILE" ]; then
  existing_base_url=$(sed -n '1p' "$ACU_BASE_URL_FILE")
fi
case "$existing_base_url" in
  https://eu.jerrypsy.top/acu|https://eu.jerrypsy.top/acu/) existing_base_url= ;;
  https://*) ;;
  *) existing_base_url= ;;
esac
if [ -n "${CLAUDE_ACU_BASE_URL:-}" ]; then
  case "$CLAUDE_ACU_BASE_URL" in
    https://*) ;;
    *) printf '%s\n' "CLAUDE_ACU_BASE_URL must be an HTTPS URL." >&2; exit 2 ;;
  esac
  if [ "$LIVE_VERIFY" = "0" ]; then
    acu_base_url=$CLAUDE_ACU_BASE_URL
  elif validation_response=$(validate_messages "$CLAUDE_ACU_BASE_URL" "$ACU_TOKEN" 2>/dev/null) &&
    printf '%s' "$validation_response" | grep -q 'CLAUDE_ACU_OK'; then
    acu_base_url=$CLAUDE_ACU_BASE_URL
  fi
elif [ -n "$existing_base_url" ]; then
  acu_base_url=$existing_base_url
elif [ "$LIVE_VERIFY" = "0" ]; then
  acu_base_url=$ACU_PUBLIC_BASE_URL
else
  for candidate in \
    "$ACU_PUBLIC_BASE_URL" \
    "$ACU_DIRECT_BASE_URL"; do
    [ -n "$candidate" ] || continue
    if validation_response=$(validate_messages "$candidate" "$ACU_TOKEN" 2>/dev/null) &&
      printf '%s' "$validation_response" | grep -q 'CLAUDE_ACU_OK'; then
      acu_base_url=$candidate
      break
    fi
  done
fi
[ -n "$acu_base_url" ] || {
  printf '%s\n' "Neither ACU Messages endpoint completed validation." >&2
  exit 1
}

credential_tmp="${ACU_CREDENTIAL}.tmp"
base_url_tmp="${ACU_BASE_URL_FILE}.tmp"
native_path_tmp="${ACU_NATIVE_PATH_FILE}.tmp"
if [ -z "$existing_token" ] || [ "$ACU_TOKEN" != "$existing_token" ]; then
  (umask 077; printf '%s\n' "$ACU_TOKEN" > "$credential_tmp")
fi
(umask 077; printf '%s\n' "$acu_base_url" > "$base_url_tmp")
(umask 077; printf '%s\n' "$native_claude" > "$native_path_tmp")
if [ -f "$credential_tmp" ]; then
  chmod 600 "$credential_tmp"
  mv "$credential_tmp" "$ACU_CREDENTIAL"
else
  chmod 600 "$ACU_CREDENTIAL"
fi
chmod 600 "$base_url_tmp" "$native_path_tmp"
mv "$base_url_tmp" "$ACU_BASE_URL_FILE"
mv "$native_path_tmp" "$ACU_NATIVE_PATH_FILE"

model_settings_tmp="${ACU_MODEL_SETTINGS_FILE}.tmp"
cat >"$model_settings_tmp" <<'EOF'
{
  "availableModels": [
    "acu-auto",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-fable-5"
  ]
}
EOF
chmod 600 "$model_settings_tmp"
mv "$model_settings_tmp" "$ACU_MODEL_SETTINGS_FILE"

cat >"${ACU_LAUNCHER}" <<'EOF'
#!/usr/bin/env sh
set -eu
ACU_HOME=${CLAUDE_ACU_HOME:-"${HOME}/.claude-acu"}
ACU_TOKEN=$(sed -n '1p' "${ACU_HOME}/credential")
ACU_BASE_URL=$(sed -n '1p' "${ACU_HOME}/base-url")
NATIVE_CLAUDE=$(sed -n '1p' "${ACU_HOME}/native-claude-path")
MODEL_SETTINGS="${ACU_HOME}/config/acu-model-settings.json"
[ -x "$NATIVE_CLAUDE" ] || { printf '%s\n' "Native Claude Code is missing; rerun the installer." >&2; exit 1; }
[ -r "$MODEL_SETTINGS" ] || { printf '%s\n' "Claude ACU model settings are missing; rerun the installer." >&2; exit 1; }

allowed_model() {
  case "$1" in
    acu-auto|claude-opus-4-8|claude-sonnet-5|claude-fable-5|opus|sonnet|fable) return 0 ;;
    *) return 1 ;;
  esac
}

validate_model_args() {
  selected_model=
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --model)
        [ "$#" -gt 1 ] || { printf '%s\n' "--model requires a model ID" >&2; exit 2; }
        selected_model=$2
        allowed_model "$selected_model" || {
          printf '%s\n' "unsupported Claude ACU model: $selected_model" >&2
          printf '%s\n' "allowed models: acu-auto, claude-opus-4-8, claude-sonnet-5, claude-fable-5" >&2
          exit 2
        }
        shift 2
        ;;
      --model=*)
        selected_model=${1#--model=}
        allowed_model "$selected_model" || {
          printf '%s\n' "unsupported Claude ACU model: $selected_model" >&2
          printf '%s\n' "allowed models: acu-auto, claude-opus-4-8, claude-sonnet-5, claude-fable-5" >&2
          exit 2
        }
        shift
        ;;
      *) shift ;;
    esac
  done
}

export CLAUDE_CONFIG_DIR="${ACU_HOME}/config"
export ANTHROPIC_BASE_URL="$ACU_BASE_URL"
export ANTHROPIC_AUTH_TOKEN="$ACU_TOKEN"
export ANTHROPIC_CUSTOM_MODEL_OPTION="acu-auto"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="ACU Auto (Recommended)"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="ACU Auto value routing"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-4-8"
export ANTHROPIC_DEFAULT_OPUS_MODEL_NAME="Claude Opus 4.8"
export ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION="Claude Opus 4.8 via ACU Messages"
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-5"
export ANTHROPIC_DEFAULT_SONNET_MODEL_NAME="Claude Sonnet 5"
export ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION="Claude Sonnet 5 via ACU Messages"
export ANTHROPIC_DEFAULT_FABLE_MODEL="claude-fable-5"
export ANTHROPIC_DEFAULT_FABLE_MODEL_NAME="Claude Fable 5"
export ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION="Claude Fable 5 via ACU Messages"
unset ANTHROPIC_DEFAULT_HAIKU_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION
unset CLAUDE_CODE_SUBAGENT_MODEL

validate_model_args "$@"
if [ -n "$selected_model" ]; then
  exec "$NATIVE_CLAUDE" --settings "$MODEL_SETTINGS" "$@"
fi
exec "$NATIVE_CLAUDE" --settings "$MODEL_SETTINGS" --model acu-auto "$@"
EOF
chmod 700 "$ACU_LAUNCHER"

if [ "$LIVE_VERIFY" != "0" ] && [ "$CLI_VERIFY" = "1" ]; then
  cli_output="${tmp_dir}/claude-cli-verification.log"
  cli_status="${tmp_dir}/claude-cli-verification.status"
  (
    set +e
    "$ACU_LAUNCHER" -p --max-turns 1 "Return exactly CLAUDE_ACU_OK" >"$cli_output" 2>&1
    printf '%s\n' "$?" >"$cli_status"
  ) &
  cli_pid=$!
  elapsed=0
  while [ ! -f "$cli_status" ] && [ "$elapsed" -lt "$VERIFY_TIMEOUT_SEC" ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if [ ! -f "$cli_status" ]; then
    kill "$cli_pid" 2>/dev/null || true
    wait "$cli_pid" 2>/dev/null || true
    printf '%s\n' "Claude Code verification exceeded ${VERIFY_TIMEOUT_SEC}s; installation is ready and can be tested with: claude-acu" >&2
  else
    wait "$cli_pid" 2>/dev/null || true
    cli_exit=$(sed -n '1p' "$cli_status")
    if [ "$cli_exit" = "0" ] && grep -q 'CLAUDE_ACU_OK' "$cli_output"; then
      :
    else
      printf '%s\n' "Claude Code verification did not return the expected text; installation is still ready." >&2
    fi
  fi
fi

printf '%s\n' "claude-acu installed at $ACU_LAUNCHER"
printf '%s\n' "Claude Code: $native_claude"
printf '%s\n' "ACU endpoint: $acu_base_url"
register_path
case ":${PATH}:" in
  *":${ACU_BIN_DIR}:"*) ;;
  *) printf '%s\n' "Open a new terminal or run: export PATH=\"$ACU_BIN_DIR:\$PATH\"" ;;
esac
